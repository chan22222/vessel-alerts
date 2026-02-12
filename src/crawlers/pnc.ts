import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class PncCrawler extends BaseCrawler {
  private readonly url =
    'https://svc.pncport.com/info/CMS/Ship/Info.pnc?mCode=MN014'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      const params = new URLSearchParams({
        STARTDATE: startCompact,
        ENDDATE: endCompact,
        ROUTE: '',
        OPERATOR: '',
        ROWCOUNT: '500',
      })

      const response = await this.http.post<string>(
        this.url,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
            Accept: 'text/html, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: this.url,
          },
          responseType: 'text',
        }
      )

      const html = response.data
      process.stderr.write(`[PncCrawler] response length: ${html.length}, first 500 chars: ${html.slice(0, 500)}\n`)
      return this.parseTable(html)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[PncCrawler] error: ${msg}\n`)
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('table tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 17) return

      const vessel = $(cells[1]).text().trim()
      const linerCode = $(cells[4]).text().trim()
      const voyage = $(cells[3]).text().trim()
      const arrived = this.formatDatetime($(cells[7]).text().trim())
      const departed = this.formatDatetime($(cells[8]).text().trim())
      const closing = this.formatDatetime($(cells[10]).text().trim())

      if (!vessel) return

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage,
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
