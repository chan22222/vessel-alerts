import { BaseCrawler } from './base.js'
import type { VesselRecord, StatusType } from '../types.js'

interface PnctVslRow {
  VSL_NAME: string
  OPERATOR: string
  VVD: string
  OPR_VVD: string
  ATB_DATE: string
  ATD_DATE: string
  ETB_DATE: string
  ETD_DATE: string
  PL_ATB_DATE: string
  PL_ATD_DATE: string
  CUT_OFF_DATE: string
  VSL_STATE: string
}

export class PnctCrawler extends BaseCrawler {
  private readonly apiUrl = 'http://www.pnct.co.kr/c001/m002Ctr/selectVslList.do'

  async crawl(): Promise<VesselRecord[]> {
    try {
      const { startDate, endDate } = this.getDateRange()
      const startCompact = startDate.replace(/-/g, '')
      const endCompact = endDate.replace(/-/g, '')

      const xmlBody = this.buildNexacroRequest(startCompact, endCompact)

      const response = await this.http.post<string>(this.apiUrl, xmlBody, {
        headers: {
          'Content-Type': 'application/xml',
          Referer: 'http://www.pnct.co.kr/infoservice/index.html',
        },
        responseType: 'text',
      })

      const rows = this.parseNexacroResponse(response.data)
      return rows.map((row) => {
        const arrived = this.pickDatetime(row.ATB_DATE, row.PL_ATB_DATE, row.ETB_DATE)
        const departed = this.pickDatetime(row.ATD_DATE, row.PL_ATD_DATE, row.ETD_DATE)
        const closing = this.formatPnctDate(row.CUT_OFF_DATE)
        const statusType = this.resolveStatus(row.VSL_STATE, arrived, departed)

        const { motherVoyage, voyage } = this.parseVoyageFields(
          (row.VVD || '').trim(),
          (row.OPR_VVD || '').trim(),
        )

        return this.makeRecord({
          vessel: row.VSL_NAME || '',
          linerCode: row.OPERATOR || '',
          voyage,
          motherVoyage,
          arrivedDatetime: arrived,
          departedDatetime: departed,
          closingDatetime: closing,
          statusType,
        })
      })
    } catch {
      return []
    }
  }

  private buildNexacroRequest(startDate: string, endDate: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">',
      '<Parameters>',
      '<Parameter id="ErrorCode" type="int">0</Parameter>',
      '<Parameter id="ErrorMsg" type="string">SUCC</Parameter>',
      '</Parameters>',
      '<Dataset id="ds_cond">',
      '<ColumnInfo>',
      '<Column id="STR_DATE" type="STRING" size="256"/>',
      '<Column id="END_DATE" type="STRING" size="256"/>',
      '</ColumnInfo>',
      '<Rows>',
      '<Row>',
      `<Col id="STR_DATE">${startDate}</Col>`,
      `<Col id="END_DATE">${endDate}</Col>`,
      '</Row>',
      '</Rows>',
      '</Dataset>',
      '</Root>',
    ].join('')
  }

  private parseNexacroResponse(xml: string): PnctVslRow[] {
    const rows: PnctVslRow[] = []

    const rowRegex = /<Row>([\s\S]*?)<\/Row>/g
    let rowMatch: RegExpExecArray | null

    while ((rowMatch = rowRegex.exec(xml)) !== null) {
      const rowXml = rowMatch[1]
      const row = this.extractRow(rowXml)
      if (row.VSL_NAME) {
        rows.push(row)
      }
    }

    return rows
  }

  private extractRow(rowXml: string): PnctVslRow {
    const getValue = (id: string): string => {
      const match = rowXml.match(new RegExp(`<Col id="${id}">([^<]*)</Col>`))
      if (!match) return ''
      return match[1]
        .replace(/&#32;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
    }

    return {
      VSL_NAME: getValue('VSL_NAME'),
      OPERATOR: getValue('OPERATOR'),
      VVD: getValue('VVD'),
      OPR_VVD: getValue('OPR_VVD'),
      ATB_DATE: getValue('ATB_DATE'),
      ATD_DATE: getValue('ATD_DATE'),
      ETB_DATE: getValue('ETB_DATE'),
      ETD_DATE: getValue('ETD_DATE'),
      PL_ATB_DATE: getValue('PL_ATB_DATE'),
      PL_ATD_DATE: getValue('PL_ATD_DATE'),
      CUT_OFF_DATE: getValue('CUT_OFF_DATE'),
      VSL_STATE: getValue('VSL_STATE'),
    }
  }

  private pickDatetime(...candidates: string[]): string {
    for (const c of candidates) {
      const formatted = this.formatPnctDate(c)
      if (formatted) return formatted
    }
    return ''
  }

  private formatPnctDate(raw: string): string {
    if (!raw || raw === '-') return ''
    const cleaned = raw.replace(/\//g, '-').trim()
    if (cleaned.length >= 16) return cleaned.substring(0, 16)
    return cleaned
  }

  /**
   * VVD 필드가 "MOTHER(IN/OUT)" 합쳐진 형태일 때 분리.
   * 예: "PCSG013(2607E/)"  → mother=PCSG013, voyage=2607E
   *     "OCWI001(001/001)" → mother=OCWI001, voyage=001/001
   *     "PCSG012(/2607W)"  → mother=PCSG012, voyage=2607W
   *     "TNJP012(26311E/26311W)" → mother=TNJP012, voyage=26311E/26311W
   */
  private parseVoyageFields(
    vvd: string,
    oprVvd: string,
  ): { motherVoyage: string; voyage: string } {
    const match = vvd.match(/^([^(]+)\(([^)]*)\)/)
    if (match) {
      const mother = match[1].trim()
      // oprVvd에도 "CODE(IN/OUT)" 형태가 올 수 있으므로 괄호 안 값만 추출
      let carrier = oprVvd || match[2].trim()
      const oprMatch = carrier.match(/\(([^)]*)\)/)
      if (oprMatch) carrier = oprMatch[1].trim()
      // 앞뒤 빈 슬래시만 제거 (예: "/2607W" → "2607W", "2607E/" → "2607E")
      const voyage = carrier.replace(/^\/|\/$/g, '')
      return { motherVoyage: mother, voyage }
    }
    return { motherVoyage: vvd, voyage: oprVvd }
  }

  private resolveStatus(
    state: string,
    arrived: string,
    departed: string,
  ): StatusType {
    if (state === 'D') return 'DEPARTED'
    if (state === 'A') return 'ARRIVED'
    if (state === 'P') return 'PLANNED'
    return this.determineStatus(arrived, departed)
  }
}
