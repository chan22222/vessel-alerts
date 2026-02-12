import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class IctCrawler extends BaseCrawler {
  private readonly url =
    'https://service.psa-ict.co.kr/webpage/vessel/vslScheduleText.jsp'

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

  private static readonly LINER_CODE_RE = /^[A-Z]{3,4}$/
  private static readonly INVALID_KEYWORDS =
    /담당|연락처|아이디|비밀번호|선석|선사|선명|Close|물량|현황|스케쥴|양적하|본선|야드|반입마감|접안예정|출항예정/

  private parseTable(html: string): VesselRecord[] {
    const $ = cheerio.load(html)
    const records: VesselRecord[] = []

    $('table tbody tr').each((_i, row) => {
      const cells = $(row).find('td')
      if (cells.length < 11) return

      const linerCode = $(cells[1]).text().trim()
      const rawVoyage = $(cells[3]).text().trim()
      const vessel = $(cells[4]).text().trim()
      const closing = this.formatDatetime($(cells[5]).text().trim())
      const arrived = this.formatDatetime($(cells[6]).text().trim())
      const departed = this.formatDatetime($(cells[7]).text().trim())
      const statusText = $(cells[10]).text().trim()

      if (!vessel) return
      if (!IctCrawler.LINER_CODE_RE.test(linerCode)) return
      if (IctCrawler.INVALID_KEYWORDS.test(vessel)) return
      if (IctCrawler.INVALID_KEYWORDS.test(linerCode)) return

      const voyage = rawVoyage.split('\n')[0].trim()

      const statusType = this.resolveStatus(statusText, arrived, departed)

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

  private resolveStatus(
    text: string,
    arrived: string,
    departed: string
  ): StatusType {
    if (text.includes('접안')) return 'ARRIVED'
    if (text.includes('출항')) return 'DEPARTED'
    if (text) return 'PLANNED'
    return this.determineStatus(arrived, departed)
  }
}
