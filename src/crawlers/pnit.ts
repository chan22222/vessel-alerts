import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class PnitCrawler extends BaseCrawler {
  private readonly url = 'https://www.pnitl.com/infoservice/vessel/vslScheduleList.jsp'
  private readonly MAX_RETRIES = 2

  async crawl(): Promise<VesselRecord[]> {
    const { startDate, endDate } = this.getDateRange()

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const pageResp = await this.http.get<string>(this.url, {
          responseType: 'text',
          timeout: 20000,
        })

        const csrfToken = this.extractCsrfToken(pageResp.data)
        const cookies = this.extractCookies(pageResp.headers['set-cookie'])

        if (!csrfToken || !cookies) {
          // GET 응답 자체에 기본 날짜 범위의 데이터가 포함됨 - 폴백으로 활용
          const fallbackRecords = this.parseTable(pageResp.data)
          if (fallbackRecords.length > 0) {
            return fallbackRecords
          }
          if (attempt < this.MAX_RETRIES) continue
          return []
        }

        const params = new URLSearchParams({
          isSearch: 'Y',
          page: '1',
          strdStDate: startDate,
          strdEdDate: endDate,
          route: '',
          tmnCod: 'P',
          CSRF_TOKEN: csrfToken,
        })

        const dataResp = await this.http.post<string>(this.url, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: cookies,
            Referer: this.url,
          },
          responseType: 'text',
          timeout: 20000,
        })

        const records = this.parseTable(dataResp.data)
        if (records.length > 0) {
          return records
        }

        // POST 결과가 비어있으면 GET 응답의 데이터를 폴백으로 사용
        const fallbackRecords = this.parseTable(pageResp.data)
        if (fallbackRecords.length > 0) {
          return fallbackRecords
        }

        if (attempt < this.MAX_RETRIES) continue
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[PnitCrawler] attempt ${attempt + 1} failed: ${msg}\n`)
        if (attempt < this.MAX_RETRIES) continue
      }
    }
    return []
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    // Find the data table by looking for header row with 선석/선명
    $('table').each((_tableIdx, table) => {
      const rows = $(table).find('tr')
      if (rows.length < 2) return

      const headerCells = $(rows[0]).find('td, th')
      const headerText = headerCells.map((_k, c) => $(c).text().trim()).get().join('|')
      if (!headerText.includes('선석') || !headerText.includes('선명')) return

      // 15 columns: 선석(0), 선사(1), 모선항차(2), 선사항차(3), Head(Bridge)Stern(4),
      //   선명(5), ROUTE(6), 반입마감시한(7), 접안(예정)일시(8), 출항(예정)일시(9),
      //   양하(10), 적하(11), Shift(12), AMP(13), 상태(14)
      rows.each((j, row) => {
        if (j === 0) return // skip header
        const cells = $(row).find('td')
        if (cells.length < 15) return

        const statusText = $(cells[14]).text().trim()
        const vessel = $(cells[5]).text().trim()
        const linerCode = $(cells[1]).text().trim()
        const voyage = $(cells[3]).text().trim()
        const arrived = this.formatDatetime($(cells[8]).text().trim())
        const departed = this.formatDatetime($(cells[9]).text().trim())
        const closing = this.formatDatetime($(cells[7]).text().trim())

        const statusType = this.resolveStatus(statusText, arrived, departed)

        records.push(
          this.makeRecord({
            vessel,
            linerCode,
            voyage,
            arrivedDatetime: arrived,
            departedDatetime: departed,
            closingDatetime: closing,
            statusType,
          })
        )
      })
    })

    return records
  }

  private resolveStatus(text: string, etb: string, etd: string): StatusType {
    const upper = text.toUpperCase()
    if (upper.includes('ARRIVED') || text.includes('접안')) return 'ARRIVED'
    if (upper.includes('DEPARTED') || text.includes('출항')) return 'DEPARTED'
    if (upper.includes('PLANNED') || text) return 'PLANNED'
    return this.determineStatus(etb, etd)
  }

  private extractCsrfToken(html: string): string | null {
    const match = html.match(
      /<input[^>]+name=["']CSRF_TOKEN["'][^>]+value=["']([^"']+)["']/
    )
    if (match) return match[1]

    const altMatch = html.match(
      /<input[^>]+value=["']([^"']+)["'][^>]+name=["']CSRF_TOKEN["']/
    )
    if (altMatch) return altMatch[1]

    const jsMatch = html.match(
      /name:\s*['"]CSRF_TOKEN['"],\s*value:\s*['"]([^'"]+)['"]/
    )
    if (jsMatch) return jsMatch[1]

    const jsAltMatch = html.match(
      /value:\s*['"]([0-9a-f-]{36})['"][^}]*name:\s*['"]CSRF_TOKEN['"]/
    )
    return jsAltMatch ? jsAltMatch[1] : null
  }

  private extractCookies(setCookieHeader: string | string[] | undefined): string {
    if (!setCookieHeader) return ''
    const headers = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader]
    const cookiePairs = headers
      .map((cookie) => cookie.split(';')[0].trim())
      .filter((pair) => pair.length > 0)
    if (cookiePairs.length === 0) return ''
    // JSESSIONID가 반드시 포함되어야 CSRF 검증 통과
    const joined = cookiePairs.join('; ')
    if (!joined.includes('JSESSIONID')) {
      process.stderr.write(`[PnitCrawler] JSESSIONID missing in cookies: ${joined}\n`)
    }
    return joined
  }
}
