import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class HbctCrawler extends BaseCrawler {
  private readonly url = 'https://custom.hktl.com/jsp/T01/sunsuk.jsp'

  private static readonly MAX_PAGES = 10

  async crawl(): Promise<VesselRecord[]> {
    try {
      const allRecords: VesselRecord[] = []

      for (let page = 1; page <= HbctCrawler.MAX_PAGES; page++) {
        const params = new URLSearchParams({
          langType: 'K',
          mainType: 'T01',
          subType: '01',
          optType: 'T',
          terminal: 'HBCTLIB',
          currentPage: String(page),
          startPage: String(page),
        })

        const response = await this.http.post(this.url, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: this.url,
          },
          responseType: 'arraybuffer',
        })

        const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
        const records = this.parseTable(html)

        if (records.length === 0) break

        allRecords.push(...records)
      }

      return allRecords
    } catch {
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('tr').each((_i, row) => {
      const cells = $(row).find('td.font8')
      if (cells.length < 14) return

      const voyage = $(cells[1]).text().trim()
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
