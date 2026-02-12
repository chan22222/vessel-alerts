import { createClient } from '@supabase/supabase-js'
import type { VesselRecord } from './types.js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  process.stderr.write('WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set\n')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

let seqCounter = 0

export function resetSeqCounter(): void {
  seqCounter = 0
}

export function nextSeq(): number {
  return ++seqCounter
}

function toKST(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T')
}

/** 성공한 터미널만 갱신, 실패한 터미널은 기존 DB 데이터 유지 */
export async function mergeRecords(newByTerminal: Map<string, VesselRecord[]>): Promise<number> {
  let totalCount = 0

  for (const [trmnCode, records] of newByTerminal) {
    // 해당 터미널 기존 데이터 삭제
    const { error: deleteError } = await supabase
      .from('vessel_records')
      .delete()
      .eq('trmn_code', trmnCode)

    if (deleteError) {
      process.stderr.write(`[Supabase] delete ${trmnCode} failed: ${deleteError.message}\n`)
      continue
    }

    // 새 데이터 삽입
    const rows = records.map((r) => ({
      trmn_code: r.trmnCode,
      trmn_name: r.trmnName,
      trmn_url: r.trmnUrl,
      liner_code: r.linerCode,
      vessel: r.vessel,
      voyage: r.voyage,
      arrived_datetime: r.arrivedDatetime,
      departed_datetime: r.departedDatetime,
      closing_datetime: r.closingDatetime,
      status_type: r.statusType,
      updated_at: new Date().toISOString(),
    }))

    const { error: insertError } = await supabase
      .from('vessel_records')
      .insert(rows)

    if (insertError) {
      process.stderr.write(`[Supabase] insert ${trmnCode} failed: ${insertError.message}\n`)
    } else {
      totalCount += records.length
    }
  }

  // 크롤링 상태 업데이트
  const { count } = await supabase
    .from('vessel_records')
    .select('*', { count: 'exact', head: true })

  await supabase
    .from('crawl_status')
    .update({ last_updated: toKST(), total_records: count ?? totalCount })
    .eq('id', 1)

  return count ?? totalCount
}
