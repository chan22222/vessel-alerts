import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface BnctItem {
  VSLNAME: string
  OPERATOR: string
  VVD: string
  OPERVSLVVDIN: string
  OPERVSLVVDOUT: string
  ETBDATE: string
  ETDDATE: string
  ATBDATE: string
  ATDDATE: string
  CUTOFFDATE: string
  TB_YN: string
  TD_YN: string
}

export class BnctCrawler extends BaseCrawler {
  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()

      const pageUrl = `${this.terminal.url}/esvc/vessel/berthScheduleT`
      const pageResp = await this.http.get<string>(pageUrl, {
        responseType: 'text',
      })

      const csrfMatch = pageResp.data.match(
        /<meta\s+name="_csrf"\s+content="([^"]+)"/
      )
      const csrfHeaderMatch = pageResp.data.match(
        /<meta\s+name="_csrf_header"\s+content="([^"]+)"/
      )

      if (!csrfMatch) {
        return []
      }

      const csrfToken = csrfMatch[1]
      const csrfHeader = csrfHeaderMatch ? csrfHeaderMatch[1] : 'X-CSRF-TOKEN'

      const cookies = this.extractCookies(pageResp.headers['set-cookie'])

      const dataUrl = `${this.terminal.url}/esvc/vessel/berthScheduleT/list?VVD=&StrDate=${startDate}&EndDate=${endDate}`
      const dataResp = await this.http.get(dataUrl, {
        headers: {
          [csrfHeader]: csrfToken,
          Cookie: cookies,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Referer: pageUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      let items: BnctItem[]
      if (typeof dataResp.data === 'string') {
        try { items = JSON.parse(dataResp.data) } catch { return [] }
      } else if (Array.isArray(dataResp.data)) {
        items = dataResp.data
      } else {
        return []
      }

      if (!Array.isArray(items)) {
        return []
      }

      return items.map((item) => {
        const status = this.resolveStatus(item)
        const arrived = item.ATBDATE || item.ETBDATE || ''
        const departed = item.ATDDATE || item.ETDDATE || ''

        const motherVoyage = item.VVD || ''
        const inVoy = item.OPERVSLVVDIN || ''
        const outVoy = item.OPERVSLVVDOUT || ''
        const voyage = inVoy && outVoy && inVoy !== outVoy
          ? `${inVoy}/${outVoy}`
          : inVoy || outVoy || ''

        return this.makeRecord({
          vessel: item.VSLNAME || '',
          linerCode: item.OPERATOR || '',
          voyage: voyage || motherVoyage,
          motherVoyage,
          arrivedDatetime: this.formatDatetime(arrived),
          departedDatetime: this.formatDatetime(departed),
          closingDatetime: this.formatDatetime(item.CUTOFFDATE || ''),
          statusType: status,
        })
      })
    } catch {
      return []
    }
  }

  private resolveStatus(item: BnctItem): StatusType {
    if (item.TD_YN === 'Y') return 'DEPARTED'
    if (item.TB_YN === 'Y') return 'ARRIVED'
    return 'PLANNED'
  }

  private extractCookies(setCookieHeader: string | string[] | undefined): string {
    if (!setCookieHeader) return ''
    const headers = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader]
    return headers
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
  }
}
