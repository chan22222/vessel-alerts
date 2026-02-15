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
  // 부산북항
  HBCT: { code: 'HBCT', name: '허치슨터미널(HBCT)', url: 'https://custom.hktl.com', port: '부산북항' },
  BPTG: { code: 'BPTG', name: 'BPT 감만(BPTG)', url: 'https://info.bptc.co.kr', port: '부산북항' },
  BPTS: { code: 'BPTS', name: 'BPT 신선대(BPTS)', url: 'https://info.bptc.co.kr', port: '부산북항' },
  // 부산신항
  PNC:  { code: 'PNC',  name: '부산신항만(PNC)', url: 'https://svc.pncport.com', port: '부산신항' },
  PNIT: { code: 'PNIT', name: '부산신항국제(PNIT)', url: 'https://www.pnitl.com', port: '부산신항' },
  HJNC: { code: 'HJNC', name: '한진부산(HJNC)', url: 'http://www.hjnc.co.kr', port: '부산신항' },
  HPNT: { code: 'HPNT', name: 'HMM PSA신항만(HPNT)', url: 'https://www.hpnt.co.kr', port: '부산신항' },
  BCT:  { code: 'BCT',  name: '부산컨테이너(BCT)', url: 'https://info.bct2-4.com', port: '부산신항' },
  BNMT: { code: 'BNMT', name: '부산신항다목적(BNMT)', url: 'http://www.bnmt.co.kr', port: '부산신항' },
  BNCT: { code: 'BNCT', name: 'BNCT', url: 'https://info.bnctkorea.com', port: '부산신항' },
  // 인천
  E1CT: { code: 'E1CT', name: 'E1터미널(E1CT)', url: 'http://www.e1ct.co.kr', port: '인천' },
  HJIT: { code: 'HJIT', name: '한진인천(HJIT)', url: 'http://59.17.254.10:9130', port: '인천' },
  ICT:  { code: 'ICT',  name: '인천컨테이너(ICT)', url: 'https://service.psa-ict.co.kr', port: '인천' },
  SNCT: { code: 'SNCT', name: '선광신터미널(SNCT)', url: 'http://snct.sun-kwang.co.kr', port: '인천' },
  IFPC: { code: 'IFPC', name: '신국제여객터미널(IFPC)', url: 'http://www.ifpc.co.kr', port: '인천' },
  // 광양
  GWCT: { code: 'GWCT', name: '광양서부(GWCT)', url: 'http://www.gwct.co.kr', port: '광양' },
  KITL: { code: 'KITL', name: '허치슨광양(KITL)', url: 'https://info.kitl.com', port: '광양' },
  // 평택
  PCTC: { code: 'PCTC', name: 'PCTC', url: 'http://www.pctc21.com', port: '평택' },
  PNCT: { code: 'PNCT', name: '평택동방아이포트(PNCT)', url: 'http://www.pnct.co.kr', port: '평택' },
  // 울산
  UNCT: { code: 'UNCT', name: '울산신항(UNCT)', url: 'http://www.unct.co.kr', port: '울산' },
  JUCT: { code: 'JUCT', name: '정일울산(JUCT)', url: 'https://www.juct.co.kr', port: '울산' },
  // 대산
  DDCT: { code: 'DDCT', name: '동방대산(DDCT)', url: 'https://ds.dongbang.co.kr', port: '대산' },
}
