import * as cheerio from 'cheerio'
import iconv from 'iconv-lite'
import type { AxiosInstance } from 'axios'
import { BaseCrawler } from './base.js'
import type { VesselRecord } from '../types.js'

const BPTC_URL = 'https://info.bptc.co.kr/Berth_status_text_servlet_sw_kr'
const BPTC_REFERER =
  'https://info.bptc.co.kr/content/sw/frame/berth_status_text_frame_sw_kr.jsp?p_id=CONT_CN_KR&search=Y&snb_num=2'

interface BptcRow {
  gubun: string
  vessel: string
  voyage: string
  linerCode: string
  arrived: string
  departed: string
  closing: string
}

async function fetchAndParse(http: AxiosInstance): Promise<BptcRow[]> {
  // 세션 쿠키 획득
  const sessionResp = await http.get(BPTC_REFERER, {
    responseType: 'arraybuffer',
    maxRedirects: 5,
  })
  const cookies: string[] = []
  const setCookie = sessionResp.headers['set-cookie']
  if (setCookie) {
    for (const c of setCookie) {
      const m = c.match(/^([^;]+)/)
      if (m) cookies.push(m[1])
    }
  }

  // 데이터 요청
  const resp = await http.post(
    BPTC_URL,
    'v_time=month&ROCD=ALL&v_oper_cd=&ORDER=item1&v_gu=A',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://info.bptc.co.kr',
        Referer: BPTC_REFERER,
        Cookie: cookies.join('; '),
      },
      responseType: 'arraybuffer',
    }
  )

  const html = iconv.decode(Buffer.from(resp.data), 'euc-kr')
  const $ = cheerio.load(html)
  const rows: BptcRow[] = []

  $('table.tabletypeC tbody tr').each((_i, row) => {
    const cells = $(row).find('td')
    if (cells.length < 11) return

    const gubun = $(cells[0]).text().trim()
    const vessel = $(cells[3]).text().trim()
    if (!vessel) return

    rows.push({
      gubun,
      vessel,
      voyage: $(cells[2]).text().trim(),
      linerCode: $(cells[5]).text().trim(),
      arrived: $(cells[7]).text().trim(),
      departed: $(cells[9]).text().trim(),
      closing: $(cells[10]).text().trim(),
    })
  })

  return rows
}

abstract class BptcBaseCrawler extends BaseCrawler {
  protected abstract readonly gubunFilter: string

  async crawl(): Promise<VesselRecord[]> {
    try {
      const rows = await fetchAndParse(this.http)
      return rows
        .filter((r) => r.gubun === this.gubunFilter)
        .map((r) => {
          const arrived = this.formatDatetime(r.arrived)
          const departed = this.formatDatetime(r.departed)
          return this.makeRecord({
            vessel: r.vessel,
            voyage: '',
            motherVoyage: r.voyage,
            linerCode: r.linerCode,
            arrivedDatetime: arrived,
            departedDatetime: departed,
            closingDatetime: this.formatDatetime(r.closing),
            statusType: this.determineStatus(arrived, departed),
          })
        })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[${this.constructor.name}] error: ${msg}\n`)
      return []
    }
  }
}

export class BptgCrawler extends BptcBaseCrawler {
  protected readonly gubunFilter = '감만'
}

export class BptsCrawler extends BptcBaseCrawler {
  protected readonly gubunFilter = '신선대'
}
