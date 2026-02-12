import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class KitlCrawler extends BaseCrawler {
  private readonly url = 'https://info.kitl.com/jsp/T01/sunsuk.jsp'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const response = await this.http.get(this.url, {
        responseType: 'arraybuffer',
      })

      const html = iconv.decode(Buffer.from(response.data), 'euc-kr')
      return this.parseTable(html)
    } catch {
      return []
    }
  }

  // Columns (14): 0=터미널항차(voyage), 1=선사항차, 2=선석, 3=Bitt,
  // 4=접안예정일시(arrived), 5=출항예정일시(departed), 6=Closing Time(closing),
  // 7=Port/STBD, 8=총물량, 9=QC, 10=모선명(vessel), 11=선사(linerCode), 12=Route, 13=Fixed
  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('tr').each((_i, row) => {
      const cells = $(row).find('td.font8')
      if (cells.length < 14) return

      const vessel = $(cells[10]).text().trim()
      const linerCode = $(cells[11]).text().trim()
      const voyage = $(cells[0]).text().trim()
      const arrived = this.formatDatetime($(cells[4]).text().trim())
      const departed = this.formatDatetime($(cells[5]).text().trim())
      const closing = this.formatDatetime($(cells[6]).text().trim())

      if (!vessel) return

      const rowBgColor = $(row).attr('bgcolor') || ''
      const statusType = this.resolveStatus(rowBgColor, arrived, departed)

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

  private resolveStatus(bgColor: string, arrived: string, departed: string): StatusType {
    const color = bgColor.toLowerCase()
    if (color.includes('pink') || color.includes('ffcccc')) return 'DEPARTED'
    if (color.includes('ccffcc') || color.includes('lightgreen')) return 'ARRIVED'
    return this.determineStatus(arrived, departed)
  }
}
