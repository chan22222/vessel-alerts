import * as cheerio from 'cheerio'
import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface NexacroRow {
  plvVslvoy: string
  cdvName: string
  cdvOperator: string
  plvEvoyin: string
  plvEvoyout: string
  cct: string
  plvAtb: string
  plvAtd: string
  atbYn: string
  atdYn: string
  plvDisvan: string
  plvLodvan: string
  plvShiftvan: string
  plvBerth: string
}

export class DdctCrawler extends BaseCrawler {
  private readonly baseUrl = 'https://ds.dongbang.co.kr'
  private readonly loginUrl = 'https://ds.dongbang.co.kr/com/SsoCtr/login.do'
  private readonly apiUrl = 'https://ds.dongbang.co.kr/nxCtr.do'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const sessionCookie = await this.login()
      if (!sessionCookie) {
        process.stderr.write(`[DdctCrawler] login failed - no session cookie\n`)
        return []
      }

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
      process.stderr.write(`[DdctCrawler] crawl error: ${msg}\n`)
      return []
    }
  }

  private async login(): Promise<string | null> {
    try {
      const loginXml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">',
        '<Dataset id="ds_cond">',
        '<ColumnInfo>',
        '<Column id="id" type="STRING" size="256"/>',
        '<Column id="pw" type="STRING" size="256"/>',
        '<Column id="locale" type="STRING" size="256"/>',
        '<Column id="autoLogin" type="STRING" size="256"/>',
        '</ColumnInfo>',
        '<Rows><Row>',
        '<Col id="id">guest</Col>',
        '<Col id="pw">guest</Col>',
        '<Col id="locale">ko</Col>',
        '<Col id="autoLogin">N</Col>',
        '</Row></Rows>',
        '</Dataset>',
        '</Root>',
      ].join('')

      const response = await this.http.post(this.loginUrl, loginXml, {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
        },
        responseType: 'text',
        maxRedirects: 0,
        validateStatus: (status: number) => status < 400,
      })

      const setCookieHeader = response.headers['set-cookie']
      if (!setCookieHeader) {
        return null
      }

      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader]

      const jsessionId = cookies
        .map((c: string) => c.split(';')[0])
        .find((c: string) => c.startsWith('JSESSIONID='))

      if (!jsessionId) {
        process.stderr.write(`[DdctCrawler] no JSESSIONID in cookies\n`)
        return null
      }

      const xml = typeof response.data === 'string' ? response.data : ''
      if (xml.includes('ErrorCode" type="int">0</') || xml.includes('ErrorCode" type="string">0</')) {
        return jsessionId
      }

      process.stderr.write(`[DdctCrawler] login response did not contain ErrorCode=0: ${xml.slice(0, 300)}\n`)
      return null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[DdctCrawler] login error: ${msg}\n`)
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
      '<Dataset id="input1">',
      '<ColumnInfo>',
      '<Column id="istFrdate" type="STRING" size="256"/>',
      '<Column id="istTodate" type="STRING" size="256"/>',
      '</ColumnInfo>',
      '<Rows><Row>',
      `<Col id="istFrdate">${startDate}</Col>`,
      `<Col id="istTodate">${endDate}</Col>`,
      '</Row></Rows>',
      '</Dataset>',
      '</Root>',
    ].join('')
  }

  private parseNexacroResponse(xml: string): VesselRecord[] {
    // cheerio XML 파서가 네임스페이스 때문에 셀렉터 매칭 실패할 수 있으므로 제거
    const cleanXml = xml.replace(/\s+xmlns="[^"]*"/g, '')
    const $ = cheerio.load(cleanXml, { xml: true })

    const errorCode = $('Parameter[id="ErrorCode"]').text().trim()
    if (errorCode !== '0') {
      return []
    }

    const records: VesselRecord[] = []
    $('Dataset[id="output1"] Row').each((_i, row) => {
      const getCol = (id: string): string => {
        const col = $(row).find(`Col[id="${id}"]`)
        return col.text().trim().replace(/&#32;/g, ' ')
      }

      const rowData: NexacroRow = {
        plvVslvoy: getCol('plvVslvoy'),
        cdvName: getCol('cdvName'),
        cdvOperator: getCol('cdvOperator'),
        plvEvoyin: getCol('plvEvoyin'),
        plvEvoyout: getCol('plvEvoyout'),
        cct: getCol('cct'),
        plvAtb: getCol('plvAtb'),
        plvAtd: getCol('plvAtd'),
        atbYn: getCol('atbYn'),
        atdYn: getCol('atdYn'),
        plvDisvan: getCol('plvDisvan'),
        plvLodvan: getCol('plvLodvan'),
        plvShiftvan: getCol('plvShiftvan'),
        plvBerth: getCol('plvBerth'),
      }

      if (!rowData.cdvName && !rowData.plvVslvoy) return

      const vesselName = rowData.cdvName || rowData.plvVslvoy
      const motherVoyage = rowData.plvEvoyin || ''
      const voyage = rowData.plvEvoyout || rowData.plvEvoyin || ''
      const arrived = this.formatDatetime(rowData.plvAtb)
      const departed = this.formatDatetime(rowData.plvAtd)
      const closing = this.formatDatetime(rowData.cct)
      const status = this.resolveStatus(rowData)

      records.push(
        this.makeRecord({
          vessel: vesselName,
          linerCode: rowData.cdvOperator || '-',
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

  private resolveStatus(row: NexacroRow): StatusType {
    if (row.atdYn === 'Y') return 'DEPARTED'
    if (row.atbYn === 'Y') return 'ARRIVED'
    return 'PLANNED'
  }
}
