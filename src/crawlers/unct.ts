import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface UnctItem {
  cdvVslName: string
  cdvVslOperator: string
  voyage: string
  etb: string
  etd: string
  cct: string
  vsbVoyStatus: string
}

export class UnctCrawler extends BaseCrawler {
  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      const dataUrl =
        `${this.terminal.url}/json/comm/commonSelect.do` +
        `?sqlId=es010_100Qry.selectBerthScheduleList` +
        `&from=${startCompact}&to=${endCompact}`

      const resp = await this.http.get(dataUrl, {
        headers: {
          Accept: 'application/json',
        },
      })

      const raw = resp.data
      const items: UnctItem[] = Array.isArray(raw)
        ? raw
        : raw?.queryResult ?? []

      if (!Array.isArray(items)) {
        return []
      }

      // 디버그: 첫 번째 아이템의 모든 키-값 출력
      if (items.length > 0) {
        process.stderr.write(`[UnctCrawler] sample keys: ${JSON.stringify(items[0])}\n`)
      }

      return items.map((item) => {
        const arrived = this.formatDatetime(item.etb || '')
        const departed = this.formatDatetime(item.etd || '')
        const closing = this.formatDatetime(item.cct || '')
        const status = this.resolveStatus(item.vsbVoyStatus, arrived, departed)

        return this.makeRecord({
          vessel: item.cdvVslName || '',
          linerCode: item.cdvVslOperator || '',
          voyage: item.voyage || '',
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: closing,
          statusType: status,
        })
      })
    } catch {
      return []
    }
  }

  private resolveStatus(
    voyStatus: string,
    arrived: string,
    departed: string
  ): StatusType {
    const code = (voyStatus || '').trim().toUpperCase()
    if (code === 'D') return 'DEPARTED'
    if (code === 'A') return 'ARRIVED'
    if (code === 'P') return 'PLANNED'
    return this.determineStatus(arrived, departed)
  }
}
