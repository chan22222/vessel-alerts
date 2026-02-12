import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class JuctCrawler extends BaseCrawler {
  private readonly url = 'https://www.juct.co.kr/web/NEW/schedule/index.asp'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const fromS = startDate.replace(/-/g, '') + '00'
      const toS = endDate.replace(/-/g, '') + '23'

      const params = new URLSearchParams({ fromS, toS })

      const response = await this.http.post(this.url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://www.juct.co.kr/Service/01.asp?ui=4',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      })

      const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
      return this.parseTable(html)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[JuctCrawler] error: ${msg}\n`)
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('tr[height="25"]').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 7) return

      const vessel = $(cells[5]).text().trim()
      if (!vessel || vessel === 'JUCT UNDEFINE VESSEL' || vessel === '모선명') return

      const voyageRaw = $(cells[0]).text().trim()
      const linerCode = voyageRaw.split('-')[0] || ''
      const arrived = this.formatDatetime($(cells[1]).text().trim())
      const departed = this.formatDatetime($(cells[2]).text().trim())

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage: voyageRaw,
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: '',
          statusType: this.determineStatus(arrived, departed),
        })
      )
    })

    return records
  }
}
