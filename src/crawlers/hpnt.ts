import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class HpntCrawler extends BaseCrawler {
  private readonly url = 'https://www.hpnt.co.kr/infoservice/vessel/vslScheduleList.jsp'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()

      const pageResp = await this.http.get<string>(this.url, {
        responseType: 'text',
      })

      const csrfToken = this.extractCsrfToken(pageResp.data)
      if (!csrfToken) {
        return []
      }

      const cookies = this.extractCookies(pageResp.headers['set-cookie'])

      const maxPages = 10
      const allRecords: VesselRecord[] = []

      for (let page = 1; page <= maxPages; page++) {
        const params = new URLSearchParams({
          isSearch: 'Y',
          page: String(page),
          strdStDate: startDate,
          strdEdDate: endDate,
          route: '',
          tmnCod: 'H',
          CSRF_TOKEN: csrfToken,
        })

        const dataResp = await this.http.post<string>(this.url, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: cookies,
            Referer: this.url,
          },
          responseType: 'text',
        })

        const pageRecords = this.parseTable(dataResp.data)
        if (pageRecords.length === 0) break

        allRecords.push(...pageRecords)
      }

      return allRecords
    } catch {
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    // Find the data table by looking for header row with 선석/선사/선명
    $('table').each((_tableIdx, table) => {
      const rows = $(table).find('tr')
      if (rows.length < 2) return

      const headerCells = $(rows[0]).find('td, th')
      const headerText = headerCells.map((_k, c) => $(c).text().trim()).get().join('|')
      if (!headerText.includes('선석') || !headerText.includes('선명')) return

      // 14 columns: 선석(0), 선사(1), 모선항차(2), 선사항차(3), 선명(4),
      //   ROUTE(5), 반입마감시한(6), 접안(예정)일시(7), 출항(예정)일시(8),
      //   양하(9), 적하(10), Shift(11), AMP(12), 상태(13)
      rows.each((j, row) => {
        if (j === 0) return // skip header
        const cells = $(row).find('td')
        if (cells.length < 14) return

        const statusText = $(cells[13]).text().trim()
        const vessel = $(cells[4]).text().trim()
        const linerCode = $(cells[1]).text().trim()
        const voyage = $(cells[2]).text().trim()
        const arrived = this.formatDatetime($(cells[7]).text().trim())
        const departed = this.formatDatetime($(cells[8]).text().trim())
        const closing = this.formatDatetime($(cells[6]).text().trim())

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
    if (text.includes('접안')) return 'ARRIVED'
    if (text.includes('출항')) return 'DEPARTED'
    if (text) return 'PLANNED'
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
    return headers
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
  }
}
