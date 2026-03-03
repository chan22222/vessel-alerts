import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class KitlCrawler extends BaseCrawler {
  private readonly url = 'https://info.kitl.com/jsp/T01/sunsuk.jsp'
  private static readonly MAX_PAGES = 10

  async crawl(): Promise<VesselRecord[]> {
    try {
      const allRecords: VesselRecord[] = []

      // 3회 분할 크롤링: 10일 전, 오늘, 10일 후
      const offsets = [-10, 0, 10]
      for (const offset of offsets) {
        const targetDate = new Date()
        targetDate.setDate(targetDate.getDate() + offset)
        const year = String(targetDate.getFullYear())
        const month = String(targetDate.getMonth() + 1).padStart(2, '0')
        const day = String(targetDate.getDate()).padStart(2, '0')

        for (let page = 1; page <= KitlCrawler.MAX_PAGES; page++) {
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
            terminal: 'KITLIB',
            currentPage: String(page),
            startPage: '1',
          })

          const response = await this.http.post(this.url, params.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Referer: this.url,
            },
            responseType: 'arraybuffer',
            timeout: 60000,
          })

          const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
          const records = this.parseTable(html)

          if (records.length === 0) break
          allRecords.push(...records)
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
    } catch {
      return []
    }
  }

  // Columns (14): 0=터미널항차(motherVoyage), 1=선사항차(voyage), 2=선석, 3=Bitt,
  // 4=접안예정일시(arrived), 5=출항예정일시(departed), 6=Closing Time(closing),
  // 7=Port/STBD, 8=총물량, 9=QC, 10=모선명(vessel), 11=선사(linerCode), 12=Route, 13=Fixed
  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('tr').each((_i, row) => {
      const cells = $(row).find('td.font8')
      if (cells.length < 14) return

      const vessel = $(cells[10]).text().trim()
      const linerCode = $(cells[11]).text().trim()
      const motherVoyage = $(cells[0]).text().trim()
      const voyage = $(cells[1]).text().trim().replace(/^\/$/, '') || motherVoyage
      const arrived = this.formatDatetime($(cells[4]).text().trim())
      const departed = this.formatDatetime($(cells[5]).text().trim())
      const closing = this.formatDatetime($(cells[6]).text().trim())

      if (!vessel) return

      const rowBgColor = $(row).attr('bgcolor') || ''
      const statusType = this.resolveStatus(rowBgColor, arrived, departed)

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

  private resolveStatus(bgColor: string, arrived: string, departed: string): StatusType {
    const color = bgColor.toLowerCase()
    if (color.includes('pink') || color.includes('ffcccc')) return 'DEPARTED'
    if (color.includes('ccffcc') || color.includes('lightgreen')) return 'ARRIVED'
    return this.determineStatus(arrived, departed)
  }
}
