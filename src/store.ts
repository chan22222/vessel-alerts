import type { VesselRecord, PageInfo, VesselApiResponse } from './types.js'
import { TERMINALS } from './types.js'

interface StoreState {
  records: VesselRecord[]
  lastUpdated: string | null
}

const state: StoreState = {
  records: [],
  lastUpdated: null,
}

let seqCounter = 0

export function resetSeqCounter(): void {
  seqCounter = 0
}

export function nextSeq(): number {
  return ++seqCounter
}

export function setRecords(records: VesselRecord[]): void {
  state.records = records
  state.lastUpdated = new Date().toISOString()
}

export function getRecords(): VesselRecord[] {
  return state.records
}

export function getLastUpdated(): string | null {
  return state.lastUpdated
}

const PORT_ORDER = ['부산', '부산신항', '인천', '광양', '평택', '울산', '대산']

export function getTerminalCodes(): { code: string; name: string; port: string; count: number }[] {
  const map = new Map<string, { name: string; count: number }>()
  for (const r of state.records) {
    const entry = map.get(r.trmnCode)
    if (entry) {
      entry.count++
    } else {
      map.set(r.trmnCode, { name: r.trmnName, count: 1 })
    }
  }
  return Array.from(map.entries())
    .map(([code, { name, count }]) => ({
      code,
      name,
      port: TERMINALS[code]?.port ?? '',
      count,
    }))
    .sort((a, b) => {
      const portA = PORT_ORDER.indexOf(a.port)
      const portB = PORT_ORDER.indexOf(b.port)
      if (portA !== portB) return (portA === -1 ? 999 : portA) - (portB === -1 ? 999 : portB)
      return a.name.localeCompare(b.name)
    })
}

export function queryRecords(params: {
  pageSize: number
  pageNo: number
  searchValue1?: string
  trmnCode?: string
}): VesselApiResponse {
  const { pageSize, pageNo, searchValue1, trmnCode } = params

  let filtered = state.records

  if (trmnCode) {
    const codes = trmnCode.split(',').map((c) => c.trim().toUpperCase())
    filtered = filtered.filter((r) => codes.includes(r.trmnCode))
  }

  if (searchValue1) {
    const q = searchValue1.toLowerCase()
    filtered = filtered.filter(
      (r) =>
        r.trmnCode.toLowerCase().includes(q) ||
        r.trmnName.toLowerCase().includes(q) ||
        r.vessel.toLowerCase().includes(q) ||
        r.voyage.toLowerCase().includes(q) ||
        r.linerCode.toLowerCase().includes(q)
    )
  }

  const totalCount = filtered.length
  const totalPageNoCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(Math.max(1, pageNo), totalPageNoCount)
  const start = (safePage - 1) * pageSize
  const list = filtered.slice(start, start + pageSize).map((r, i) => ({
    ...r,
    rowNum: start + i + 1,
  }))

  const pageGroupSize = 10
  const currentGroup = Math.ceil(safePage / pageGroupSize)
  const startPageNo = (currentGroup - 1) * pageGroupSize + 1
  const endPageNo = Math.min(currentGroup * pageGroupSize, totalPageNoCount)

  const pageInfo: PageInfo = {
    pageSize,
    pageNo: safePage,
    totalCount,
    totalPageNoCount,
    startPageNo,
    endPageNo,
    prevPageNo: safePage > 1 ? safePage - 1 : null,
    nextPageNo: safePage < totalPageNoCount ? safePage + 1 : null,
  }

  return {
    resultCode: 0,
    resultMessage: 'SUCCESS',
    resultObject: {
      list,
      pageInfo,
      lastUpdatedDate: state.lastUpdated ?? new Date().toISOString(),
    },
  }
}
