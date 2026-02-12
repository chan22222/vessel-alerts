import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class HjitCrawler extends BaseCrawler {
  private readonly url = 'http://59.17.254.10:9130/esvc/berth/BerthAction.do'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const params = new URLSearchParams({
        cmd: 'BerthScheduleList',
        menuID: '01',
        subMenuID: '1',
        pgID: '01',
        nowPage: '1',
        scPeriod: '30',
        rowPerPage: '500',
      })

      const dataResp = await this.http.post<string>(this.url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: this.url,
        },
        responseType: 'text',
      })

      return this.parseTable(dataResp.data)
    } catch {
      return []
    }
  }

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    // Columns (13 total):
    //   0: 항차(voyage), 1: 모선명(vessel), 2: 선사(linerCode),
    //   3: 입항항차, 4: 출항항차,
    //   5: CCT/Closing, 6: ETB/ATB(arrived), 7: ETD/ATD(departed),
    //   8: 양하, 9: 적하, 10: 이적, 11: 선석, 12: 노선명

    $('table tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 13) return

      const firstCell = $(cells[0])
      if (!firstCell.hasClass('ta2')) return

      const voyage = firstCell.text().trim()
      const vessel = $(cells[1]).text().trim()
      const linerCode = $(cells[2]).text().trim()
      const closing = this.formatDatetime($(cells[5]).text().trim())
      const arrived = this.formatDatetime($(cells[6]).text().trim())
      const departed = this.formatDatetime($(cells[7]).text().trim())

      if (!vessel || vessel === '-') return

      const bgColor = firstCell.attr('bgcolor') || ''
      const statusType = this.resolveStatus(bgColor, arrived, departed)

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

  private resolveStatus(bgColor: string, etb: string, etd: string): StatusType {
    const colorLower = bgColor.toLowerCase()
    if (colorLower.includes('#ccffcc') || colorLower.includes('ccffcc')) {
      return 'DEPARTED'
    }
    if (colorLower.includes('#ffcccc') || colorLower.includes('ffcccc')) {
      return 'ARRIVED'
    }
    return this.determineStatus(etb, etd)
  }
}
