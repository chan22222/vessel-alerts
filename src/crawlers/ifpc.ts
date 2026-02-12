import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

interface IfpcBerthItem {
  vslVoy: string
  plvEstber: string
  plvEstdep: string
  plvBerthno: string
  plvCct: string
}

interface IfpcApiResponse {
  resultList: IfpcBerthItem[]
  startDate?: string
  endDate?: string
}

export class IfpcCrawler extends BaseCrawler {
  private readonly apiUrl =
    'http://www.ifpc.co.kr/main/MainCtr/getBerthSchedule.do'

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
        startDate: startCompact,
        endDate: endCompact,
      })

      const response = await this.http.post<IfpcApiResponse>(
        this.apiUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: 'http://www.ifpc.co.kr/main/',
          },
        }
      )

      const data = response.data
      if (!data || !Array.isArray(data.resultList)) {
        return []
      }

      return data.resultList
        .filter((item) => item.vslVoy && item.vslVoy.trim() !== '')
        .map((item) => {
          const { vessel, voyage } = this.parseVslVoy(item.vslVoy)
          const arrived = this.formatDatetime(item.plvEstber || '')
          const departed = this.formatDatetime(item.plvEstdep || '')
          const closing = this.normalizeCct(item.plvCct)

          return this.makeRecord({
            vessel,
            linerCode: '-',
            voyage,
            arrivedDatetime: arrived,
            departedDatetime: departed,
            closingDatetime: closing,
            statusType: this.determineStatus(arrived, departed),
          })
        })
    } catch {
      return []
    }
  }

  private parseVslVoy(vslVoy: string): { vessel: string; voyage: string } {
    const trimmed = vslVoy.trim()
    const lastDash = trimmed.lastIndexOf('-')
    if (lastDash > 0) {
      return {
        vessel: trimmed.substring(0, lastDash),
        voyage: trimmed,
      }
    }
    return { vessel: trimmed, voyage: trimmed }
  }

  private normalizeCct(cct: string): string {
    if (!cct || cct === '-' || cct.trim() === '') return ''
    return this.formatDatetime(cct)
  }
}
