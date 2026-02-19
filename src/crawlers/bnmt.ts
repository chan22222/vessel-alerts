import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class BnmtCrawler extends BaseCrawler {
  private readonly baseUrl = 'http://www.bnmt.co.kr/ebiz/'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      // The ASP page requires POST with STATE=SEARCH to trigger data retrieval.
      // A simple GET returns the page with an empty table body.
      const params = new URLSearchParams({
        code: '0101',
        subp: '',
        STATE: 'SEARCH',
        txt1: startCompact,
        txt2: endCompact,
      })

      const response = await this.http.post(
        this.baseUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: `${this.baseUrl}?code=0101`,
          },
          responseType: 'arraybuffer',
        }
      )

      const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
      return this.parseTable(html)
    } catch {
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 10) return

      // Columns: 모선항차(0), 모선명(1), 선사(2), 접안일시(3), 작업완료일시(4),
      //          Closing Time(5), 양하(6), 적하(7), 이적(8), 선석(9)
      const voyage = $(cells[0]).text().trim()
      const vessel = $(cells[1]).text().trim()
      const linerCode = $(cells[2]).text().trim()
      const arrived = this.formatDatetime($(cells[3]).text().trim())
      const departed = this.formatDatetime($(cells[4]).text().trim())
      const closing = this.formatDatetime($(cells[5]).text().trim())

      // Skip header rows
      if (!vessel || vessel === '모선명') return

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage: '',
          motherVoyage: voyage,
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: closing,
          statusType: this.determineStatus(arrived, departed),
        })
      )
    })

    return records
  }
}
