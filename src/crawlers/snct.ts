import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class SnctCrawler extends BaseCrawler {
  private readonly url =
    'http://snct.sun-kwang.co.kr/infoservice/webpage/vessel/vslScheduleText.jsp'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const now = new Date()
      const start = new Date(now)
      start.setDate(start.getDate() - 2)
      const end = new Date(now)
      end.setDate(end.getDate() + 7)

      const startCompact = this.formatYmdCompact(start)
      const endCompact = this.formatYmdCompact(end)

      const params = new URLSearchParams({
        isSearch: 'Y',
        strdStDate: startCompact,
        strdEdDate: endCompact,
      })

      const response = await this.http.post(this.url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: this.url,
        },
        responseType: 'arraybuffer',
      })

      const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
      return this.parseTable(html)
    } catch {
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('table tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 14) return

      const rawVoyage = $(cells[2]).text().trim()
      const vessel = $(cells[5]).text().trim()
      const arrived = this.formatDatetime($(cells[6]).text().trim())
      const closing = this.formatDatetime($(cells[8]).text().trim())
      const departed = this.formatDatetime($(cells[9]).text().trim())
      const linerCode = $(cells[10]).text().trim()

      if (!vessel) return

      const voyMatch = rawVoyage.match(/^([A-Z]{4}-?\s*\d{3})\s*(.*)$/)
      const motherVoyage = voyMatch ? voyMatch[1].replace(/\s+/g, '') : ''
      const voyage = voyMatch && voyMatch[2] ? voyMatch[2].trim() : rawVoyage

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
