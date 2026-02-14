import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class E1ctCrawler extends BaseCrawler {
  private readonly url = 'http://www.e1ct.co.kr/info/terminal/berthText'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      const pageResp = await this.http.get<string>(this.url, {
        responseType: 'text',
      })

      const csrfToken = this.extractCsrfToken(pageResp.data)
      if (!csrfToken) {
        return []
      }

      const cookies = this.extractCookies(pageResp.headers['set-cookie'])

      const params = new URLSearchParams({
        searchStartDt: startCompact,
        searchEndDt: endCompact,
        _csrf: csrfToken,
      })

      const dataResp = await this.http.post<string>(this.url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookies,
          Referer: this.url,
        },
        responseType: 'text',
      })

      return this.parseTable(dataResp.data)
    } catch {
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('table tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      // Columns: No(0), 선석(1), 모선항차(2), 연도(3), 선박명(4),
      //          접안(예정)일시(5), 반입마감시한(6), 출항(예정)일시(7),
      //          선사(8), 양하수량(9), 적하수량(10), Shift(11)
      if (cells.length < 9) return

      const vessel = $(cells[4]).text().trim()
      const linerCode = $(cells[8]).text().trim()
      const rawVoyage = $(cells[2]).text().trim()
      const arrived = this.formatDatetime($(cells[5]).text().trim())
      const departed = this.formatDatetime($(cells[7]).text().trim())
      const closing = this.formatDatetime($(cells[6]).text().trim())

      const voyMatch = rawVoyage.match(/^([A-Z]{4}-?\s*\d{3})\s*(.*)$/)
      const motherVoyage = voyMatch ? voyMatch[1].replace(/\s+/g, '') : ''
      const voyage = voyMatch && voyMatch[2] ? voyMatch[2].trim() : rawVoyage

      const bgColor = $(row).attr('bgcolor') || $(row).attr('style') || ''
      const statusType = this.resolveStatus(bgColor, arrived, departed)

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

  private resolveStatus(bgColor: string, etb: string, etd: string): StatusType {
    const colorLower = bgColor.toLowerCase()
    if (colorLower.includes('#ffff99') || colorLower.includes('ffff99')) {
      return 'ARRIVED'
    }
    if (colorLower.includes('#ccffff') || colorLower.includes('ccffff')) {
      return 'PLANNED'
    }
    return this.determineStatus(etb, etd)
  }

  private extractCsrfToken(html: string): string | null {
    const match = html.match(
      /<meta\s+name=["']_csrf["']\s+content=["']([^"']+)["']/
    )
    if (match) return match[1]

    const altMatch = html.match(
      /<meta\s+content=["']([^"']+)["']\s+name=["']_csrf["']/
    )
    return altMatch ? altMatch[1] : null
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
