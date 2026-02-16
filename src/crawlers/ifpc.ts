import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

export class IfpcCrawler extends BaseCrawler {
  private readonly baseUrl = 'http://www.ifpc.co.kr/INFO'
  private readonly loginUrl = 'http://www.ifpc.co.kr/INFO/com/SsoCtr/login.do'
  private readonly apiUrl = 'http://www.ifpc.co.kr/INFO/nxCtr.do'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const sessionCookie = await this.login()
      if (!sessionCookie) return []

      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      const requestXml = this.buildScheduleRequestXml(startCompact, endCompact)

      const response = await this.http.post<string>(this.apiUrl, requestXml, {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          Cookie: sessionCookie,
          Referer: `${this.baseUrl}/infoservice/index.html`,
        },
        responseType: 'text',
      })

      return this.parseNexacroResponse(response.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[IfpcCrawler] crawl error: ${msg}\n`)
      return []
    }
  }

  private async login(): Promise<string | null> {
    const loginXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">',
      '<Dataset id="ds_cond"><ColumnInfo>',
      '<Column id="id" type="STRING" size="256"/>',
      '<Column id="pw" type="STRING" size="256"/>',
      '<Column id="locale" type="STRING" size="256"/>',
      '<Column id="autoLogin" type="STRING" size="256"/>',
      '</ColumnInfo><Rows><Row>',
      '<Col id="id">guest</Col>',
      '<Col id="pw">guest</Col>',
      '<Col id="locale">ko</Col>',
      '<Col id="autoLogin">N</Col>',
      '</Row></Rows></Dataset></Root>',
    ].join('')

    try {
      const response = await this.http.post(this.loginUrl, loginXml, {
        headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
        responseType: 'text',
      })

      const setCookieHeader = response.headers['set-cookie']
      if (!setCookieHeader) return null

      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader]

      return cookies.map((c: string) => c.split(';')[0]).join('; ')
    } catch {
      return null
    }
  }

  private buildScheduleRequestXml(startDate: string, endDate: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">',
      '<Parameters>',
      '<Parameter id="method">getList</Parameter>',
      '<Parameter id="sqlId">ist_020Qry.selectList</Parameter>',
      '<Parameter id="styZoncd">1510SP</Parameter>',
      '</Parameters>',
      '<Dataset id="input1"><ColumnInfo>',
      '<Column id="istFrdate" type="STRING" size="256"/>',
      '<Column id="istTodate" type="STRING" size="256"/>',
      '</ColumnInfo><Rows><Row>',
      `<Col id="istFrdate">${startDate}</Col>`,
      `<Col id="istTodate">${endDate}</Col>`,
      '</Row></Rows></Dataset></Root>',
    ].join('')
  }

  private parseNexacroResponse(xml: string): VesselRecord[] {
    const cleanXml = xml.replace(/\s+xmlns="[^"]*"/g, '')
    const $ = cheerio.load(cleanXml, { xml: true })

    const errorCode = $('Parameter[id="ErrorCode"]').text().trim()
    if (errorCode !== '0') return []

    const records: VesselRecord[] = []
    $('Dataset[id="output1"] Row').each((_i, row) => {
      const getCol = (id: string): string => {
        const col = $(row).find(`Col[id="${id}"]`)
        return col.text().trim().replace(/&#32;/g, ' ')
      }

      const cdvName = getCol('cdvName')
      const plvVslvoy = getCol('plvVslvoy')
      if (!cdvName && !plvVslvoy) return

      const vessel = cdvName || plvVslvoy
      const evoyIn = getCol('plvEvoyin')
      const evoyOut = getCol('plvEvoyout')
      const motherVoyage = plvVslvoy || ''
      const voyage = evoyIn && evoyOut && evoyIn !== evoyOut
        ? `${evoyIn}/${evoyOut}`
        : evoyIn || evoyOut || ''

      const arrived = this.formatDatetime(getCol('plvAtb'))
      const departed = this.formatDatetime(getCol('plvAtd'))
      const closing = this.formatDatetime(getCol('cct'))

      const atdYn = getCol('atdYn')
      const atbYn = getCol('atbYn')
      let status: StatusType
      if (atdYn === 'Y') status = 'DEPARTED'
      else if (atbYn === 'Y') status = 'ARRIVED'
      else status = 'PLANNED'

      records.push(
        this.makeRecord({
          vessel,
          linerCode: getCol('cdvOperator') || '-',
          voyage,
          motherVoyage,
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: closing,
          statusType: status,
        })
      )
    })

    return records
  }
}
