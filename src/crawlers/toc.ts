import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

export class TocCrawler extends BaseCrawler {
  private readonly apiUrl = 'https://www.e-iway.com/public/searchBerthStat'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      const xmlBody = this.buildRequest(startDate, endDate, startCompact, endCompact)

      const response = await this.http.post<string>(this.apiUrl, xmlBody, {
        headers: {
          'Content-Type': 'text/xml',
          Accept: 'application/xml, text/xml, */*',
          Origin: 'https://www.e-iway.com',
          Referer: 'https://www.e-iway.com/',
          'X-Requested-With': 'XMLHttpRequest',
        },
        responseType: 'text',
      })

      return this.parseResponse(response.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[TocCrawler] error: ${msg}\n`)
      return []
    }
  }

  private parseResponse(xml: string): VesselRecord[] {
    const records: VesselRecord[] = []

    // ds_list 데이터셋에서 Row 추출
    const dsListMatch = xml.match(/<Dataset\s+id="ds_list">([\s\S]*?)<\/Dataset>/)
    if (!dsListMatch) return []

    const dsListXml = dsListMatch[1]
    const rowRegex = /<Row>([\s\S]*?)<\/Row>/g
    let rowMatch: RegExpExecArray | null

    while ((rowMatch = rowRegex.exec(dsListXml)) !== null) {
      const rowXml = rowMatch[1]
      const get = (id: string): string => {
        const m = rowXml.match(new RegExp(`<Col id="${id}">([^<]*)</Col>`))
        return m ? m[1].trim() : ''
      }

      const vessel = get('cmshpNm')
      if (!vessel) continue

      const linerCode = get('crierCd')
      const arrived = get('aportDtTm')
      const departed = get('dportDtTm')

      // 양하(IN)/적하(OUT) 항차
      const inVoy = get('dchrRmk')
      const outVoy = get('drpngRmk')
      const voyage = inVoy && outVoy && inVoy !== outVoy
        ? `${inVoy}/${outVoy}`
        : inVoy || outVoy || ''

      records.push(
        this.makeRecord({
          vessel,
          linerCode,
          voyage,
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: '',
          statusType: this.determineStatus(arrived, departed),
        })
      )
    }

    return records
  }

  private buildRequest(
    startDate: string,
    endDate: string,
    startCompact: string,
    endCompact: string,
  ): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">',
      '<Parameters>',
      '<Parameter id="scrPath">om::OdrMngmBerthOperStateGrid2</Parameter>',
      '<Parameter id="menuId">OM_920006</Parameter>',
      '</Parameters>',
      '<Dataset id="__DS_TRANS_INFO__">',
      '<ColumnInfo>',
      '<Column id="strSvcID" type="string" size="256"/>',
      '<Column id="strURL" type="string" size="256"/>',
      '<Column id="strInDatasets" type="string" size="256"/>',
      '<Column id="strOutDatasets" type="string" size="256"/>',
      '</ColumnInfo>',
      '<Rows>',
      '<Row>',
      '<Col id="strSvcID">searchBerthStat</Col>',
      '<Col id="strURL">public/searchBerthStat</Col>',
      '<Col id="strInDatasets">ds_search</Col>',
      '<Col id="strOutDatasets">ds_list</Col>',
      '</Row>',
      '<Row>',
      '<Col id="strOutDatasets">ds_rmk</Col>',
      '</Row>',
      '</Rows>',
      '</Dataset>',
      '<Dataset id="dsScrInfo">',
      '<ColumnInfo>',
      '<Column id="scrSn" type="STRING" size="256"/>',
      '<Column id="scrId" type="STRING" size="256"/>',
      '<Column id="scrPath" type="STRING" size="256"/>',
      '<Column id="menuId" type="STRING" size="256"/>',
      '<Column id="menuSn" type="STRING" size="256"/>',
      '<Column id="cntrNo" type="STRING" size="256"/>',
      '<Column id="strtDt" type="STRING" size="256"/>',
      '<Column id="endDt" type="STRING" size="256"/>',
      '<Column id="pBrdKndCd" type="STRING" size="256"/>',
      '</ColumnInfo>',
      '<Rows>',
      '<Row>',
      '<Col id="scrPath">om::OdrMngmBerthOperStateGrid2</Col>',
      '<Col id="menuId">OM_920006</Col>',
      `<Col id="strtDt">${startDate}</Col>`,
      `<Col id="endDt">${endDate}</Col>`,
      '</Row>',
      '</Rows>',
      '</Dataset>',
      '<Dataset id="ds_search">',
      '<ColumnInfo>',
      '<Column id="fromAportDt" type="STRING" size="256"/>',
      '<Column id="toAportDt" type="STRING" size="256"/>',
      '<Column id="pierCdList" type="STRING" size="256"/>',
      '<Column id="portalDpYn" type="STRING" size="256"/>',
      '<Column id="coCdFlag" type="STRING" size="256"/>',
      '<Column id="befPierCd" type="STRING" size="256"/>',
      '<Column id="fromWrkCmpletDt" type="STRING" size="256"/>',
      '<Column id="toWrkStrtDt" type="STRING" size="256"/>',
      '<Column id="fileSn" type="STRING" size="256"/>',
      '<Column id="sn" type="STRING" size="256"/>',
      '<Column id="berthCd" type="STRING" size="256"/>',
      '</ColumnInfo>',
      '<Rows>',
      '<Row>',
      `<Col id="fromAportDt">${startCompact}</Col>`,
      `<Col id="toAportDt">${endCompact}</Col>`,
      '<Col id="pierCdList"/>',
      '<Col id="portalDpYn">Y</Col>',
      '<Col id="coCdFlag">N</Col>',
      `<Col id="toWrkStrtDt">${endCompact}</Col>`,
      '</Row>',
      '</Rows>',
      '</Dataset>',
      '</Root>',
    ].join('')
  }
}
