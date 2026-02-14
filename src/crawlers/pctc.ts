import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface PctcItem {
  VSL_NM: string
  PTNR_CODE: string
  VOY_NO: string
  OPR_VOY: string
  ATA: string | null
  ATD: string | null
  ATC: string | null
  ATW: string | null
  YARD_CLOSE: string | null
  STATUS: string
  BERTH_NO: string
  IN_LANE: string
  LOAD_QTY: number
  DIS_QTY: number
  SHIFT_QTY: number
  ALONGSIDE: string
  RNUM: number
  SEQ: number
  TOT_CNT: number
  MOVE_TMNL: string | null
}

interface PctcResponse {
  content: PctcItem[]
  totalPages: number
  page: number
  totalElements: number
}

export class PctcCrawler extends BaseCrawler {
  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const referer = `${this.terminal.url}/esvc/vessel/berthScheduleT`

      const allItems: PctcItem[] = []
      let currentPage = 1
      let totalPages = 1

      do {
        const dataUrl = `${this.terminal.url}/esvc/vessel/berthScheduleT/data`
        const dataResp = await this.http.get<PctcResponse>(dataUrl, {
          params: {
            startDate,
            endDate,
            sort: 'TB',
            page: currentPage,
          },
          headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Referer: referer,
            'X-Requested-With': 'XMLHttpRequest',
          },
        })

        const body: PctcResponse =
          typeof dataResp.data === 'string'
            ? JSON.parse(dataResp.data)
            : dataResp.data

        if (!body.content || !Array.isArray(body.content)) {
          break
        }

        allItems.push(...body.content)
        totalPages = body.totalPages ?? 1
        currentPage++
      } while (currentPage <= totalPages)

      return allItems.map((item) => {
        const status = this.resolveStatus(item.STATUS)
        return this.makeRecord({
          vessel: item.VSL_NM || '',
          linerCode: item.PTNR_CODE || '',
          voyage: item.OPR_VOY || item.VOY_NO || '',
          motherVoyage: item.VOY_NO || '',
          arrivedDatetime: this.formatDatetime(item.ATA || ''),
          departedDatetime: this.formatDatetime(item.ATD || ''),
          closingDatetime: this.formatDatetime(item.YARD_CLOSE || ''),
          statusType: status,
        })
      })
    } catch {
      return []
    }
  }

  private resolveStatus(status: string): StatusType {
    switch (status) {
      case 'done':
        return 'DEPARTED'
      case 'work':
        return 'ARRIVED'
      default:
        return 'PLANNED'
    }
  }
}
