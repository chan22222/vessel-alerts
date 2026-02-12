import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class JuctCrawler extends BaseCrawler {
  private readonly url = 'https://www.juct.co.kr/web/NEW/schedule/index.asp'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const [fromY, fromM, fromD] = startDate.split('-')
      const [toY, toM, toD] = endDate.split('-')

      const params = new URLSearchParams({
        fromS: `${fromY}${fromM}${fromD}00`,
        toS: `${toY}${toM}${toD}16`,
        fromY, fromM, fromD, fromH: '00',
        toY, toM, toD, toH: '16',
      })

      const response = await this.http.post(this.url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
          Referer: 'https://www.juct.co.kr/web/NEW/schedule/index.asp',
          Origin: 'https://www.juct.co.kr',
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

    $('table tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 7) return

      const voyage = $(cells[0]).text().trim()
      const arrived = this.formatDatetime($(cells[1]).text().trim())
      const departed = this.formatDatetime($(cells[2]).text().trim())
      const vessel = $(cells[5]).text().trim()
      const linerCode = $(cells[6]).text().trim()

      if (!vessel) return

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage,
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
