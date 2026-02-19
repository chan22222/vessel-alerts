import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface DgtItem {
  vesselName: string
  vesselCode: string
  voyageYear: string
  voyageSeq: string
  carrier: string
  inVoyage: string
  outVoyage: string
  eta: string
  ata: string
  etb: string
  atb: string
  etd: string
  atd: string
  status: string
  cctDate: string
  loadCloseDate: string
}

export class DgtCrawler extends BaseCrawler {
  private readonly pageUrl = `${this.terminal.url}/DGT/esvc/vessel/berthScheduleT`
  private readonly apiUrl = `${this.terminal.url}/DGT/berth/vesselSchedule`

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      // CSRF 토큰 + 세션 쿠키 획득
      const pageResp = await this.http.get<string>(this.pageUrl, {
        responseType: 'text',
      })

      const csrfMatch = pageResp.data.match(
        /<meta\s+name="_csrf"\s+content="([^"]+)"/
      )
      const csrfHeaderMatch = pageResp.data.match(
        /<meta\s+name="_csrf_header"\s+content="([^"]+)"/
      )

      if (!csrfMatch) return []

      const csrfToken = csrfMatch[1]
      const csrfHeader = csrfHeaderMatch ? csrfHeaderMatch[1] : 'X-CSRF-TOKEN'
      const cookies = this.extractCookies(pageResp.headers['set-cookie'])

      // 데이터 요청
      const dataResp = await this.http.post(
        this.apiUrl,
        { fromDate: startCompact, toDate: endCompact },
        {
          headers: {
            [csrfHeader]: csrfToken,
            Cookie: cookies,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Referer: this.pageUrl,
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      )

      const body = typeof dataResp.data === 'string'
        ? JSON.parse(dataResp.data)
        : dataResp.data

      const items: DgtItem[] = body?.vesselSchedules
      if (!Array.isArray(items)) return []

      return items.map((item) => {
        const arrived = item.ata || item.eta || ''
        const departed = item.atd || item.etd || ''

        // 모선항차: vesselCode + voyageSeq (+ /year)
        const motherBase = `${item.vesselCode}${item.voyageSeq}`
        const motherVoyage = item.voyageYear
          ? `${motherBase}/${item.voyageYear}`
          : motherBase

        // 선사항차: inVoyage / outVoyage
        const inVoy = (item.inVoyage || '').trim()
        const outVoy = (item.outVoyage || '').trim()
        const voyage = inVoy && outVoy && inVoy !== outVoy
          ? `${inVoy}/${outVoy}`
          : inVoy || outVoy || ''

        return this.makeRecord({
          vessel: item.vesselName || '',
          linerCode: item.carrier || '',
          voyage,
          motherVoyage,
          arrivedDatetime: this.formatDatetime(arrived),
          departedDatetime: this.formatDatetime(departed),
          closingDatetime: this.formatDatetime(item.cctDate || item.loadCloseDate || ''),
          statusType: this.resolveStatus(item.status, arrived, departed),
        })
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[DgtCrawler] error: ${msg}\n`)
      return []
    }
  }

  private resolveStatus(status: string, arrived: string, departed: string): StatusType {
    const s = (status || '').toLowerCase()
    if (s.includes('depart')) return 'DEPARTED'
    if (s.includes('arriv')) return 'ARRIVED'
    if (s.includes('plan')) return 'PLANNED'
    return this.determineStatus(arrived, departed)
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
