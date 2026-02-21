/**
 * 로컬 PC 전용 DDCT 크롤링 스크립트
 * DDCT 서버가 Railway/GitHub Actions IP를 차단하므로 로컬에서 실행
 *
 * 사용법:
 *   node local-ddct.mjs
 *
 * 환경변수 (.env 파일 또는 직접 설정):
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 */
import https from 'node:https'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { readFileSync } from 'node:fs'

// .env 파일 수동 로드
try {
  const envContent = readFileSync(new URL('./.env', import.meta.url), 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env 없으면 무시 */ }

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.')
  console.error('.env 파일을 생성하거나 환경변수를 직접 설정하세요.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const TERMINAL = { code: 'DDCT', name: '동방대산(DDCT)', url: 'https://ds.dongbang.co.kr' }

const insecureAgent = new https.Agent({ rejectUnauthorized: false })
const http = axios.create({
  timeout: 30000,
  httpsAgent: insecureAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
})

function nexacroHeaders(extra = {}) {
  return {
    'Content-Type': 'text/xml',
    Accept: 'application/xml, text/xml, */*',
    Origin: 'https://ds.dongbang.co.kr',
    Referer: 'https://ds.dongbang.co.kr/infoservice/index.html',
    'X-Requested-With': 'XMLHttpRequest',
    'Cache-Control': 'no-cache, no-store',
    Pragma: 'no-cache',
    ...extra,
  }
}

async function login() {
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

  const response = await http.post('https://ds.dongbang.co.kr/com/SsoCtr/login.do', loginXml, {
    headers: nexacroHeaders(),
    responseType: 'text',
    maxRedirects: 0,
    validateStatus: s => s < 400,
  })

  const cookies = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie']
    : [response.headers['set-cookie']].filter(Boolean)

  const jsid = cookies.map(c => c.split(';')[0]).find(c => c.startsWith('JSESSIONID='))
  if (!jsid) throw new Error('JSESSIONID not found')

  const xml = response.data || ''
  if (!xml.includes('ErrorCode" type="int">0<') && !xml.includes('ErrorCode" type="string">0<')) {
    throw new Error('Login ErrorCode != 0')
  }

  return jsid
}

function getDateRange() {
  const now = new Date()
  const start = new Date(now); start.setDate(start.getDate() - 7)
  const end = new Date(now); end.setDate(end.getDate() + 30)
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
  return { startDate: fmt(start), endDate: fmt(end) }
}

function formatDatetime(input) {
  if (!input || input === '-') return ''
  const cleaned = input.replace(/\//g, '-').replace(/[()]/g, '').trim()
  return cleaned.length >= 16 ? cleaned.substring(0, 16) : cleaned
}

function resolveStatus(row) {
  if (row.atdYn === 'Y') return 'DEPARTED'
  if (row.atbYn === 'Y') return 'ARRIVED'
  return 'PLANNED'
}

async function crawl(sessionCookie) {
  const { startDate, endDate } = getDateRange()

  const requestXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">',
    '<Parameters>',
    '<Parameter id="styZoncd">1510SP</Parameter>',
    '<Parameter id="method">getList</Parameter>',
    '<Parameter id="sqlId">ist_020Qry.selectList</Parameter>',
    '<Parameter id="useIudSql" />',
    '<Parameter id="dao" />',
    '</Parameters>',
    '<Dataset id="input1">',
    '<ColumnInfo>',
    '<Column id="istFrdate" type="STRING" size="256" />',
    '<Column id="istTodate" type="STRING" size="256" />',
    '</ColumnInfo>',
    '<Rows><Row>',
    `<Col id="istFrdate">${startDate}</Col>`,
    `<Col id="istTodate">${endDate}</Col>`,
    '</Row></Rows>',
    '</Dataset>',
    '</Root>',
  ].join('')

  const response = await http.post('https://ds.dongbang.co.kr/nxCtr.do', requestXml, {
    headers: nexacroHeaders({ Cookie: sessionCookie }),
    responseType: 'text',
  })

  const cleanXml = response.data.replace(/\s+xmlns="[^"]*"/g, '')
  const $ = cheerio.load(cleanXml, { xml: true })

  const errorCode = $('Parameter[id="ErrorCode"]').text().trim()
  if (errorCode !== '0') throw new Error(`API ErrorCode: ${errorCode}`)

  const records = []
  let seq = 1

  $('Dataset[id="output1"] Row').each((_i, row) => {
    const getCol = id => $(row).find(`Col[id="${id}"]`).text().trim().replace(/&#32;/g, ' ')

    const cdvName = getCol('cdvName')
    const plvVslvoy = getCol('plvVslvoy')
    if (!cdvName && !plvVslvoy) return

    const evoyIn = getCol('plvEvoyin') || ''
    const evoyOut = getCol('plvEvoyout') || ''
    const voyage = evoyIn && evoyOut && evoyIn !== evoyOut
      ? `${evoyIn}/${evoyOut}`
      : evoyIn || evoyOut || ''

    records.push({
      trmn_code: TERMINAL.code,
      trmn_name: TERMINAL.name,
      trmn_url: TERMINAL.url,
      liner_code: getCol('cdvOperator') || '-',
      vessel: cdvName || plvVslvoy,
      voyage,
      mother_voyage: plvVslvoy || '',
      arrived_datetime: formatDatetime(getCol('plvAtb')),
      departed_datetime: formatDatetime(getCol('plvAtd')),
      closing_datetime: formatDatetime(getCol('cct')),
      status_type: resolveStatus({
        atbYn: getCol('atbYn'),
        atdYn: getCol('atdYn'),
      }),
      updated_at: new Date().toISOString(),
    })
  })

  return records
}

async function upsertToSupabase(records) {
  // 기존 DGT 데이터 삭제
  const { error: delError } = await supabase
    .from('vessel_records')
    .delete()
    .eq('trmn_code', TERMINAL.code)

  if (delError) throw new Error(`Delete failed: ${delError.message}`)

  // 새 데이터 삽입 (500건씩)
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500)
    const { error: insertError } = await supabase
      .from('vessel_records')
      .insert(batch)

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`)
  }
}

// 실행
async function main() {
  const startTime = Date.now()

  console.log('[DDCT-Local] Logging in...')
  const sessionCookie = await login()
  console.log('[DDCT-Local] Login OK')

  console.log('[DDCT-Local] Crawling...')
  const records = await crawl(sessionCookie)
  console.log(`[DDCT-Local] ${records.length} records fetched`)

  if (records.length === 0) {
    console.log('[DDCT-Local] No records, skipping DB update')
    return
  }

  console.log('[DDCT-Local] Upserting to Supabase...')
  await upsertToSupabase(records)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[DDCT-Local] Done! ${records.length} records updated (${elapsed}s)`)
}

main().catch(err => {
  console.error(`[DDCT-Local] Fatal: ${err.message}`)
  process.exit(1)
})
