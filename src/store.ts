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

const FRESHNESS_MS = 5 * 60 * 1000 // 5분 이내 업데이트된 터미널은 skip

/** 성공한 터미널만 갱신, 실패한 터미널은 기존 DB 데이터 유지 */
export async function mergeRecords(newByTerminal: Map<string, VesselRecord[]>): Promise<number> {
  let totalCount = 0

  for (const [trmnCode, records] of newByTerminal) {
    // 다른 인스턴스가 최근에 이미 업데이트했는지 확인
    const { data: latest } = await supabase
      .from('vessel_records')
      .select('updated_at')
      .eq('trmn_code', trmnCode)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (latest?.updated_at) {
      const lastUpdate = new Date(latest.updated_at).getTime()
      if (Date.now() - lastUpdate < FRESHNESS_MS) {
        process.stdout.write(`[Supabase] ${trmnCode} skipped (recently updated)\n`)
        continue
      }
    }

    // 변동 감지: 삭제 전 기존 데이터 조회
    const { data: existingRows } = await supabase
      .from('vessel_records')
      .select('vessel, voyage, arrived_datetime, departed_datetime, closing_datetime')
      .eq('trmn_code', trmnCode)

    if (existingRows && existingRows.length > 0) {
      await detectChanges(trmnCode, existingRows, records)
    }

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
      mother_voyage: r.motherVoyage,
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

interface ExistingRow {
  vessel: string
  voyage: string
  arrived_datetime: string | null
  departed_datetime: string | null
  closing_datetime: string | null
}

const COMPARE_FIELDS = [
  { db: 'arrived_datetime', rec: 'arrivedDatetime' },
  { db: 'departed_datetime', rec: 'departedDatetime' },
  { db: 'closing_datetime', rec: 'closingDatetime' },
] as const

function isEmptyValue(v: string | null | undefined): boolean {
  return !v || v === '-' || v === '--' || v === '/' || v === ''
}

function parseDateMs(dt: string | null | undefined): number | null {
  if (isEmptyValue(dt)) return null
  const d = new Date(dt!.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d.getTime()
}

async function detectChanges(
  trmnCode: string,
  existingRows: ExistingRow[],
  newRecords: VesselRecord[],
): Promise<void> {
  // 기존 레코드를 vessel+voyage 키로 맵핑
  const oldMap = new Map<string, ExistingRow>()
  for (const r of existingRows) {
    const key = `${r.vessel}::${r.voyage ?? ''}`
    oldMap.set(key, r)
  }

  const changes: {
    vessel: string
    trmn_code: string
    voyage: string
    field_name: string
    old_value: string
    new_value: string
    delay_minutes: number
  }[] = []

  for (const newRec of newRecords) {
    const key = `${newRec.vessel}::${newRec.voyage ?? ''}`
    const oldRec = oldMap.get(key)
    if (!oldRec) continue

    for (const field of COMPARE_FIELDS) {
      const oldVal = oldRec[field.db as keyof ExistingRow] as string | null
      const newVal = newRec[field.rec as keyof VesselRecord] as string

      // 둘 다 빈 값이면 무시
      if (isEmptyValue(oldVal) && isEmptyValue(newVal)) continue
      // 같은 값이면 무시
      if (oldVal === newVal) continue

      const oldMs = parseDateMs(oldVal)
      const newMs = parseDateMs(newVal)

      // 둘 다 유효한 날짜일 때만 비교
      if (oldMs === null || newMs === null) continue

      const diffMinutes = Math.round((newMs - oldMs) / 60_000)

      // 1시간 미만 변동은 노이즈로 간주하고 무시
      if (Math.abs(diffMinutes) < 60) continue

      changes.push({
        vessel: newRec.vessel,
        trmn_code: trmnCode,
        voyage: newRec.voyage ?? '',
        field_name: field.db,
        old_value: oldVal ?? '',
        new_value: newVal,
        delay_minutes: diffMinutes,
      })
    }
  }

  if (changes.length === 0) return

  const { error } = await supabase
    .from('vessel_schedule_changes')
    .insert(changes.map((c) => ({
      ...c,
      detected_at: new Date().toISOString(),
    })))

  if (error) {
    process.stderr.write(`[Supabase] schedule changes insert failed: ${error.message}\n`)
  } else {
    process.stdout.write(`[Supabase] ${trmnCode}: ${changes.length} schedule change(s) detected\n`)
  }
}
