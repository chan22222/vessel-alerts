export type StatusType = 'PLANNED' | 'ARRIVED' | 'DEPARTED'

export interface VesselRecord {
  rowNum: number
  trmnSeq: number
  trmnCode: string
  trmnName: string
  trmnUrl: string
  linerCode: string
  vessel: string
  voyage: string
  motherVoyage: string
  arrivedDatetime: string
  departedDatetime: string
  closingDatetime: string
  statusType: StatusType
}

export interface PageInfo {
  pageSize: number
  pageNo: number
  totalCount: number
  totalPageNoCount: number
  startPageNo: number
  endPageNo: number
  prevPageNo: number | null
  nextPageNo: number | null
}

export interface VesselApiResponse {
  resultCode: number
  resultMessage: string
  resultObject: {
    list: VesselRecord[]
    pageInfo: PageInfo
    lastUpdatedDate: string
  }
}

export interface TerminalInfo {
  code: string
  name: string
  url: string
  port: string
}

export const TERMINALS: Record<string, TerminalInfo> = {
  // 부산
  PCTC: { code: 'PCTC', name: 'BPT 감만(PCTC)', url: 'http://www.pctc21.com', port: '부산' },
  HBCT: { code: 'HBCT', name: '허치슨 감만(HBCT)', url: 'https://custom.hktl.com', port: '부산' },
  // 부산신항
  BCT:  { code: 'BCT',  name: 'BCT(부산신항)', url: 'https://info.bct2-4.com', port: '부산신항' },
  BNCT: { code: 'BNCT', name: 'BNCT(부산신항)', url: 'https://info.bnctkorea.com', port: '부산신항' },
  BNMT: { code: 'BNMT', name: 'BNMT(부산신항)', url: 'http://www.bnmt.co.kr', port: '부산신항' },
  PNIT: { code: 'PNIT', name: 'PNIT(부산신항)', url: 'https://www.pnitl.com', port: '부산신항' },
  PNC:  { code: 'PNC',  name: '부산신항만(PNC)', url: 'https://svc.pncport.com', port: '부산신항' },
  HJNC: { code: 'HJNC', name: '한진신항(HJNC)', url: 'http://www.hjnc.co.kr', port: '부산신항' },
  HPNT: { code: 'HPNT', name: '현대부산신항(HPNT)', url: 'https://www.hpnt.co.kr', port: '부산신항' },
  // 인천
  E1CT: { code: 'E1CT', name: 'E1(E1CT)', url: 'http://www.e1ct.co.kr', port: '인천' },
  SNCT: { code: 'SNCT', name: '선광(SNCT)', url: 'http://snct.sun-kwang.co.kr', port: '인천' },
  IFPC: { code: 'IFPC', name: '신국제여객터미널(IFPC)', url: 'http://www.ifpc.co.kr', port: '인천' },
  ICT:  { code: 'ICT',  name: '인천(ICT)', url: 'https://service.psa-ict.co.kr', port: '인천' },
  HJIT: { code: 'HJIT', name: '한진(HJIT)', url: 'http://59.17.254.10:9130', port: '인천' },
  // 광양
  GWCT: { code: 'GWCT', name: '광양서부(GWCT)', url: 'http://www.gwct.co.kr', port: '광양' },
  KITL: { code: 'KITL', name: '한국국제(KITL)', url: 'https://info.kitl.com', port: '광양' },
  // 평택
  PNCT: { code: 'PNCT', name: '평택동방아이포트(PNCT)', url: 'http://www.pnct.co.kr', port: '평택' },
  // 울산
  UNCT: { code: 'UNCT', name: 'UNCT(울산)', url: 'http://www.unct.co.kr', port: '울산' },
  JUCT: { code: 'JUCT', name: '정일울산(JUCT)', url: 'https://www.juct.co.kr', port: '울산' },
  // 대산
  DDCT: { code: 'DDCT', name: '동방대산(DDCT)', url: 'https://ds.dongbang.co.kr', port: '대산' },
}
