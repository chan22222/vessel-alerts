import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class HbctCrawler extends BaseCrawler {
  private readonly url = 'https://custom.hktl.com/jsp/T01/sunsuk.jsp'
  private static readonly MAX_PAGES = 10

  async crawl(): Promise<VesselRecord[]> {
    try {
      // 세션 쿠키 획득
      const initResp = await this.http.get(this.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      })
      const cookies: string[] = []
      const setCookie = initResp.headers['set-cookie']
      if (setCookie) {
        for (const c of (Array.isArray(setCookie) ? setCookie : [setCookie])) {
          const m = c.match(/^([^;]+)/)
          if (m) cookies.push(m[1])
        }
      }
      const cookieStr = cookies.join('; ')

      // 초기 GET 응답도 파싱
      const initHtml = iconv.decode(Buffer.from(initResp.data), 'euc-kr')
      const allRecords: VesselRecord[] = [...this.parseTable(initHtml)]

      // 3회 분할 크롤링: 10일 전, 오늘, 10일 후
      const offsets = [-10, 0, 10]
      for (const offset of offsets) {
        const targetDate = new Date()
        targetDate.setDate(targetDate.getDate() + offset)
        const year = String(targetDate.getFullYear())
        const month = String(targetDate.getMonth() + 1).padStart(2, '0')
        const day = String(targetDate.getDate()).padStart(2, '0')

        for (let page = 1; page <= HbctCrawler.MAX_PAGES; page++) {
          const params = new URLSearchParams({
            year,
            month,
            day,
            vessel: '',
            ctrno: '',
            langType: 'K',
            mainType: 'T01',
            subType: '01',
            optType: 'T',
            terminal: 'HBCTLIB',
            currentPage: String(page),
            startPage: '1',
          })

          try {
            const response = await this.http.post(this.url, params.toString(), {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: this.url,
                Cookie: cookieStr,
              },
              responseType: 'arraybuffer',
              timeout: 60000,
            })

            const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
            const records = this.parseTable(html)

            if (records.length === 0) break
            allRecords.push(...records)
          } catch {
            break
          }
        }
      }

      // vessel+출항일시 기준 중복 제거
      const seen = new Set<string>()
      return allRecords.filter((r) => {
        const key = `${r.vessel}::${r.departedDatetime}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[HbctCrawler] error: ${msg}\n`)
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('tr').each((_i, row) => {
      const cells = $(row).find('td.font8')
      if (cells.length < 14) return

      const motherVoyage = $(cells[0]).text().trim()
      const voyage = $(cells[1]).text().trim().replace(/^\/$/, '')
      const vessel = $(cells[11]).text().trim()
      const linerCode = $(cells[12]).text().trim()
      const arrived = this.formatDatetime($(cells[4]).text().trim())
      const departed = this.formatDatetime($(cells[6]).text().trim())
      const closing = this.formatDatetime($(cells[7]).text().trim())

      if (!vessel) return

      const rowClass = $(row).attr('class') || ''
      const statusType = this.resolveStatusByClass(rowClass, arrived, departed)

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage,
          motherVoyage,
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: closing,
          statusType,
        })
      )
    })

    return records
  }

  private resolveStatusByClass(
    className: string,
    arrived: string,
    departed: string
  ): StatusType {
    if (className.includes('end')) return 'DEPARTED'
    if (className.includes('work')) return 'ARRIVED'
    if (className.includes('plan')) return 'PLANNED'
    return this.determineStatus(arrived, departed)
  }
}
