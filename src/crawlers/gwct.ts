import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class GwctCrawler extends BaseCrawler {
  private readonly url = 'http://www.gwct.co.kr/sub/sub_B2'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const response = await this.http.get<string>(this.url, {
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
