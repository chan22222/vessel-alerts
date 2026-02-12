import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class JuctCrawler extends BaseCrawler {
  private readonly url = 'https://www.juct.co.kr/Web/NEW/total_schedule/index.asp'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const response = await this.http.get(this.url, {
        headers: {
          Referer: 'https://www.juct.co.kr/',
        },
        responseType: 'arraybuffer',
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

    $('tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 18) return

      const vessel = $(cells[3]).text().trim()
      if (!vessel) return

      const arrived = this.formatDatetime($(cells[1]).text().trim())
      const departed = this.formatDatetime($(cells[2]).text().trim())
      const linerCode = $(cells[4]).text().trim()

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage: '',
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
