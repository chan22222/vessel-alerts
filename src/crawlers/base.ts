import https from 'node:https'
import axios, { type AxiosInstance } from 'axios'
import type { VesselRecord, StatusType, TerminalInfo } from '../types.js'
import { nextSeq } from '../store.js'

const insecureAgent = new https.Agent({ rejectUnauthorized: false })

export abstract class BaseCrawler {
  protected terminal: TerminalInfo
  protected http: AxiosInstance

  constructor(terminal: TerminalInfo) {
    this.terminal = terminal
    this.http = axios.create({
      timeout: 30000,
      httpsAgent: insecureAgent,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
  }

  abstract crawl(): Promise<VesselRecord[]>

  protected makeRecord(data: {
    linerCode: string
    vessel: string
    voyage: string
    motherVoyage?: string
    arrivedDatetime: string
    departedDatetime: string
    closingDatetime: string
    statusType: StatusType
  }): VesselRecord {
    return {
      rowNum: 0,
      trmnSeq: nextSeq(),
      trmnCode: this.terminal.code,
      trmnName: this.terminal.name,
      trmnUrl: this.terminal.url,
      linerCode: data.linerCode || '-',
      vessel: data.vessel || '-',
      voyage: data.voyage || '-',
      motherVoyage: data.motherVoyage || '',
      arrivedDatetime: data.arrivedDatetime || '',
      departedDatetime: data.departedDatetime || '',
      closingDatetime: data.closingDatetime || '',
      statusType: data.statusType,
    }
  }

  protected determineStatus(etb: string, etd: string): StatusType {
    const now = Date.now()
    const etbTime = etb ? new Date(etb).getTime() : 0
    const etdTime = etd ? new Date(etd).getTime() : 0

    if (etdTime && etdTime < now) return 'DEPARTED'
    if (etbTime && etbTime < now) return 'ARRIVED'
    return 'PLANNED'
  }

  protected formatDatetime(input: string): string {
    if (!input || input === '-') return ''
    const cleaned = input
      .replace(/\//g, '-')
      .replace(/[()]/g, '')
      .trim()
    if (cleaned.length >= 16) return cleaned.substring(0, 16)
    return cleaned
  }

  protected getDateRange(): { startDate: string; endDate: string } {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    const end = new Date(now)
    end.setDate(end.getDate() + 30)

    return {
      startDate: this.formatYmd(start),
      endDate: this.formatYmd(end),
    }
  }

  protected formatYmd(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  protected formatYmdCompact(date: Date): string {
    return this.formatYmd(date).replace(/-/g, '')
  }
}
