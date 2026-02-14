import https from 'node:https'
import axios from 'axios'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface HjncRawItem {
  VSL_NM: string
  PTNR_CODE: string
  VOY_NO: string
  OPR_VOY: string
  ATA: string
  ATD: string
  YARD_CLOSE: string
  STATUS: string
}

interface HjncResponse {
  stringContent: string
  total: number
}

export class HjncCrawler extends BaseCrawler {
  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()

      const pageUrl = `${this.terminal.url}/esvc/vessel/berthScheduleT`
      const pageResp = await this.http.get<string>(pageUrl, {
        responseType: 'text',
      })

      const cookies = this.extractCookies(pageResp.headers['set-cookie'])

      // HJNC requires Content-Type: application/json as a default header.
      // Axios strips Content-Type from GET requests when set per-request,
      // so we create a dedicated instance with it as a common header.
      const jsonHttp = axios.create({
        timeout: 30000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/json',
        },
      })

      const amount = 200
      const maxPages = 10
      const items: HjncRawItem[] = []

      for (let page = 1; page <= maxPages; page++) {
        const dataUrl = `${this.terminal.url}/esvc/vessel/berthScheduleT/data?startDate=${startDate}&endDate=${endDate}&sort=ATA&dateType=week&amount=${amount}&page=${page}`
        const dataResp = await jsonHttp.get<HjncResponse>(dataUrl, {
          headers: {
            Cookie: cookies,
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Referer: pageUrl,
            'X-Requested-With': 'XMLHttpRequest',
          },
        })

        const raw = dataResp.data
        if (!raw || !raw.stringContent) {
          break
        }

        const pageItems: HjncRawItem[] = JSON.parse(raw.stringContent)
        if (!Array.isArray(pageItems)) {
          break
        }

        items.push(...pageItems)

        if (items.length >= raw.total) {
          break
        }
      }

      if (items.length === 0) {
        return []
      }

      return items.map((item) => {
        const arrived = this.formatDatetime(item.ATA || '')
        const departed = this.formatDatetime(item.ATD || '')
        const closing = this.formatDatetime(item.YARD_CLOSE || '')

        return this.makeRecord({
          vessel: item.VSL_NM || '',
          linerCode: item.PTNR_CODE || '',
          voyage: item.OPR_VOY || item.VOY_NO || '',
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: closing,
          statusType: this.resolveStatus(item.STATUS, arrived, departed),
        })
      })
    } catch {
      return []
    }
  }

  private resolveStatus(status: string, etb: string, etd: string): StatusType {
    if (status === 'departed') return 'DEPARTED'
    if (status === 'arrived' || status === 'working') return 'ARRIVED'
    if (status === 'plan') return 'PLANNED'
    return this.determineStatus(etb, etd)
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
