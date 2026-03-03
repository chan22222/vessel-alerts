import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class GwctCrawler extends BaseCrawler {
  private readonly pageUrl = 'http://www.gwct.co.kr/sub/sub_B2'
  private readonly searchUrl = 'http://www.gwct.co.kr/sub/sub_B2/search'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const [y1, m1, d1] = startDate.split('-')
      const [y2, m2, d2] = endDate.split('-')

      const params = new URLSearchParams({
        page: '1',
        pageSize: '500',
        v_time: 'term',
        fromY: y1, fromM: String(Number(m1)), fromD: String(Number(d1)),
        toY: y2, toM: String(Number(m2)), toD: String(Number(d2)),
        range: 'ETB',
      })

      const response = await this.http.post<string>(this.searchUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: this.pageUrl,
        },
        responseType: 'text',
      })

      return this.parseTable(response.data)
    } catch {
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('table tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 17) return

      const vessel = $(cells[3]).text().trim()
      const linerCode = $(cells[6]).text().trim()
      const motherVoyage = $(cells[2]).text().trim()
      const detailVoyage = $(cells[4]).text().trim().replace(/\s+/g, '')
      const voyage = detailVoyage || motherVoyage
      const arrived = this.formatDatetime($(cells[7]).text().trim())
      const departed = this.formatDatetime($(cells[8]).text().trim())
      const closing = this.formatDatetime($(cells[11]).text().trim())

      if (!vessel) return

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage,
          motherVoyage,
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
