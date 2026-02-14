import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface BctVessel {
  plvVslvoy: string
  cdvName: string
  cdvOperator: string
  plvAtb: string
  plvAtd: string
  cct: string
  plvStatus: string
  plvVsl: string
  plvVoy: string
  plvEvoyin: string
  plvEvoyout: string
}

const NEXACRO_NS = 'http://www.nexacroplatform.com/platform/dataset'

const LOGIN_XML = [
  "<?xml version='1.0' encoding='UTF-8'?>",
  `<Root xmlns='${NEXACRO_NS}'>`,
  '<Parameters />',
  "<Dataset id='ds_cond'>",
  '<ColumnInfo>',
  "<Column id='id' type='STRING' size='256'/>",
  "<Column id='pw' type='STRING' size='256'/>",
  "<Column id='locale' type='STRING' size='256'/>",
  "<Column id='autoLogin' type='STRING' size='256'/>",
  '</ColumnInfo>',
  '<Rows><Row>',
  "<Col id='id'>guest</Col>",
  "<Col id='pw' />",
  "<Col id='locale'>ko</Col>",
  "<Col id='autoLogin'>Y</Col>",
  '</Row></Rows>',
  '</Dataset>',
  '</Root>',
].join('')

export class BctCrawler extends BaseCrawler {
  private readonly baseUrl = 'https://info.bct2-4.com'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const cookies = await this.login()
      if (!cookies) return []

      const xml = await this.fetchSchedule(cookies)
      if (!xml) return []

      return this.parseResponse(xml)
    } catch {
      return []
    }
  }

  private async login(): Promise<string | null> {
    try {
      const resp = await this.http.post(
        `${this.baseUrl}/com/SsoCtr/login.do`,
        LOGIN_XML,
        {
          headers: {
            'Content-Type': 'text/xml; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      )

      return this.extractCookies(resp.headers['set-cookie'])
    } catch {
      return null
    }
  }

  private async fetchSchedule(cookies: string): Promise<string | null> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const frDate = startDate.replace(/-/g, '')
      const toDate = endDate.replace(/-/g, '')

      const requestXml = this.buildScheduleRequest(frDate, toDate)

      const resp = await this.http.post(
        `${this.baseUrl}/nxCtr.do`,
        requestXml,
        {
          headers: {
            'Content-Type': 'text/xml; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookies,
          },
          responseType: 'text',
        }
      )

      return typeof resp.data === 'string' ? resp.data : null
    } catch {
      return null
    }
  }

  private buildScheduleRequest(frDate: string, toDate: string): string {
    return [
      "<?xml version='1.0' encoding='UTF-8'?>",
      `<Root xmlns='${NEXACRO_NS}'>`,
      '<Parameters>',
      "<Parameter id='method'>getList</Parameter>",
      "<Parameter id='sqlId'>ist_010Qry.selectVslVoyList</Parameter>",
      "<Parameter id='useIudSql'>undefined</Parameter>",
      "<Parameter id='dao'>undefined</Parameter>",
      "<Parameter id='styZoncd'>1510SP</Parameter>",
      '</Parameters>',
      "<Dataset id='input1'>",
      '<ColumnInfo>',
      "<Column id='istFrdate' type='STRING' size='256'/>",
      "<Column id='istTodate' type='STRING' size='256'/>",
      "<Column id='istRoute' type='STRING' size='256'/>",
      "<Column id='istOper' type='STRING' size='256'/>",
      '</ColumnInfo>',
      '<Rows><Row>',
      `<Col id='istFrdate'>${frDate}</Col>`,
      `<Col id='istTodate'>${toDate}</Col>`,
      '</Row></Rows>',
      '</Dataset>',
      '</Root>',
    ].join('')
  }

  private parseResponse(xml: string): VesselRecord[] {
    const $ = cheerio.load(xml, { xmlMode: true })
    const records: VesselRecord[] = []

    const errorCode = $('Parameter[id="ErrorCode"]').text()
    if (errorCode !== '0') return []

    $('Dataset[id="output1"] Row').each((_i, row) => {
      const getCol = (id: string): string => {
        const col = $(row).find(`Col[id="${id}"]`)
        return col.length ? col.text().trim() : ''
      }

      const vessel: BctVessel = {
        plvVslvoy: getCol('plvVslvoy'),
        cdvName: getCol('cdvName'),
        cdvOperator: getCol('cdvOperator'),
        plvAtb: getCol('plvAtb'),
        plvAtd: getCol('plvAtd'),
        cct: getCol('cct'),
        plvStatus: getCol('plvStatus'),
        plvVsl: getCol('plvVsl'),
        plvVoy: getCol('plvVoy'),
        plvEvoyin: getCol('plvEvoyin'),
        plvEvoyout: getCol('plvEvoyout'),
      }

      if (!vessel.cdvName) return

      const statusType = this.resolveStatus(vessel.plvStatus)
      const arrived = this.formatDatetime(vessel.plvAtb)
      const departed = this.formatDatetime(vessel.plvAtd)
      const closing = this.formatDatetime(vessel.cct)

      const motherVoyage = vessel.plvVslvoy || `${vessel.plvVsl}${vessel.plvVoy}`
      const evoyin = vessel.plvEvoyin || ''
      const evoyout = vessel.plvEvoyout || ''
      const voyage = evoyin && evoyout && evoyin !== evoyout
        ? `${evoyin}-${evoyout}`
        : evoyin || evoyout || ''

      records.push(
        this.makeRecord({
          vessel: vessel.cdvName,
          linerCode: vessel.cdvOperator,
          voyage,
          motherVoyage,
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: closing,
          statusType,
        })
      )
    })

    return records
  }

  private resolveStatus(status: string): StatusType {
    const lower = status.toLowerCase()
    if (lower === 'departed' || lower === 'd') return 'DEPARTED'
    if (lower === 'working' || lower === 'arrived' || lower === 'w' || lower === 'i') return 'ARRIVED'
    return 'PLANNED'
  }

  private extractCookies(
    setCookieHeader: string | string[] | undefined
  ): string {
    if (!setCookieHeader) return ''
    const headers = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader]
    return headers
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
  }
}
