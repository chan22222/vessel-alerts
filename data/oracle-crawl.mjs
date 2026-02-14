/**
 * Oracle Cloud VM 전용 크롤러 (한국 IP)
 * HBCT, JUCT, PNIT - Railway/GitHub Actions에서 연결 실패하는 터미널
 */
import { execSync } from 'node:child_process';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// .env 로드
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envContent = readFileSync(join(__dirname, '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key && val) process.env[key] = val;
    }
  }
} catch (e) { /* .env not found */ }

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDatetime(input) {
  if (!input || input === '-') return '';
  const cleaned = input.replace(/\//g, '-').replace(/[()]/g, '').trim();
  return cleaned.length >= 16 ? cleaned.substring(0, 16) : cleaned;
}

function determineStatus(etb, etd) {
  const now = Date.now();
  if (etd && new Date(etd).getTime() < now) return 'DEPARTED';
  if (etb && new Date(etb).getTime() < now) return 'ARRIVED';
  return 'PLANNED';
}

function curlGet(url, headers = {}) {
  const hFlags = Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`).join(' ');
  return execSync(
    `curl -sk '${url}' ${hFlags} -H 'User-Agent: ${UA}' --max-time 30`,
    { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }
  );
}

function curlPost(url, body, headers = {}) {
  const hFlags = Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`).join(' ');
  return execSync(
    `curl -sk '${url}' -X POST -d '${body}' ${hFlags} -H 'User-Agent: ${UA}' --max-time 30`,
    { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }
  );
}

// ========== HBCT ==========
async function crawlHbct() {
  const url = 'https://custom.hktl.com/jsp/T01/sunsuk.jsp';
  const all = [];
  for (let page = 1; page <= 10; page++) {
    if (page > 1) await sleep(4000);
    const body = `langType=K&mainType=T01&subType=01&optType=T&terminal=HBCTLIB&currentPage=${page}&startPage=${page}`;
    let buf;
    try {
      buf = curlPost(url, body, {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url,
      });
    } catch (e) {
      process.stderr.write(`[HBCT] page ${page} fetch failed, stopping\n`);
      break;
    }
    const html = iconv.decode(buf, 'euc-kr');
    const $ = cheerio.load(html);
    let pageRecords = 0;
    $('tr').each((_i, row) => {
      const cells = $(row).find('td.font8');
      if (cells.length < 14) return;
      const vessel = $(cells[11]).text().trim();
      if (!vessel) return;
      const arrived = formatDatetime($(cells[4]).text().trim());
      const departed = formatDatetime($(cells[6]).text().trim());
      const className = $(row).attr('class') || '';
      let status;
      if (className.includes('end')) status = 'DEPARTED';
      else if (className.includes('work')) status = 'ARRIVED';
      else if (className.includes('plan')) status = 'PLANNED';
      else status = determineStatus(arrived, departed);
      all.push({
        vessel, voyage: $(cells[1]).text().trim() || '-',
        motherVoyage: '',
        linerCode: $(cells[12]).text().trim() || '-',
        arrived, departed,
        closing: formatDatetime($(cells[7]).text().trim()), status,
      });
      pageRecords++;
    });
    if (pageRecords === 0) break;
  }
  return all;
}

// ========== JUCT ==========
async function crawlJuct() {
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - 7);
  const end = new Date(now); end.setDate(end.getDate() + 30);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const fromS = fmt(start) + '00';
  const toS = fmt(end) + '23';

  const url = 'https://www.juct.co.kr/web/NEW/schedule/index.asp';
  let buf;
  try {
    buf = curlPost(url, `fromS=${fromS}&toS=${toS}`, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://www.juct.co.kr/Service/01.asp?ui=4',
    });
  } catch (e) {
    process.stderr.write(`[JUCT] fetch failed: ${e.message}\n`);
    return [];
  }
  const html = iconv.decode(buf, 'euc-kr');
  const $ = cheerio.load(html);
  const records = [];
  $('tr[height="25"]').each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 7) return;
    const vessel = $(cells[5]).text().trim();
    if (!vessel || vessel === 'JUCT UNDEFINE VESSEL' || vessel === '모선명') return;
    const voyageRaw = $(cells[0]).text().trim();
    const linerCode = voyageRaw.split('-')[0] || '';
    const arrived = formatDatetime($(cells[1]).text().trim());
    const departed = formatDatetime($(cells[2]).text().trim());
    records.push({
      vessel, voyage: voyageRaw, motherVoyage: '',
      linerCode: linerCode || '-',
      arrived, departed, closing: '',
      status: determineStatus(arrived, departed),
    });
  });
  return records;
}

// ========== PNIT ==========
async function crawlPnit() {
  const url = 'https://www.pnitl.com/infoservice/vessel/vslScheduleList.jsp';
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - 7);
  const end = new Date(now); end.setDate(end.getDate() + 30);
  const fmtDate = (d) => d.toISOString().slice(0, 10);

  // 1) GET으로 CSRF 토큰 + 쿠키 획득
  let getHtml;
  try {
    getHtml = curlGet(url).toString('utf-8');
  } catch (e) {
    process.stderr.write(`[PNIT] GET failed: ${e.message}\n`);
    return [];
  }

  // 쿠키 추출 (별도 curl -v로)
  let cookies = '';
  let csrfToken = '';
  try {
    const headerBuf = execSync(
      `curl -sk -D - -o /dev/null '${url}' -H 'User-Agent: ${UA}' --max-time 30`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    const cookieParts = [];
    for (const line of headerBuf.split('\n')) {
      const m = line.match(/^set-cookie:\s*([^;]+)/i);
      if (m) cookieParts.push(m[1].trim());
    }
    cookies = cookieParts.join('; ');
  } catch (e) {
    process.stderr.write(`[PNIT] cookie fetch failed\n`);
  }

  // CSRF 토큰 추출
  const csrfMatch = getHtml.match(/name=["']CSRF_TOKEN["'][^>]+value=["']([^"']+)["']/)
    || getHtml.match(/value=["']([^"']+)["'][^>]+name=["']CSRF_TOKEN["']/)
    || getHtml.match(/name:\s*['"]CSRF_TOKEN['"],\s*value:\s*['"]([^'"]+)['"]/);
  if (csrfMatch) csrfToken = csrfMatch[1];

  function parsePnitTable(html) {
    const $ = cheerio.load(html);
    const records = [];
    $('table').each((_ti, table) => {
      const rows = $(table).find('tr');
      if (rows.length < 2) return;
      const headerText = $(rows[0]).find('td, th').map((_k, c) => $(c).text().trim()).get().join('|');
      if (!headerText.includes('선석') || !headerText.includes('선명')) return;
      rows.each((j, row) => {
        if (j === 0) return;
        const cells = $(row).find('td');
        if (cells.length < 15) return;
        const vessel = $(cells[5]).text().trim();
        const motherVoyage = $(cells[2]).text().trim();
        const arrived = formatDatetime($(cells[8]).text().trim());
        const departed = formatDatetime($(cells[9]).text().trim());
        const closing = formatDatetime($(cells[7]).text().trim());
        const statusText = $(cells[14]).text().trim().toUpperCase();
        let status;
        if (statusText.includes('ARRIVED') || statusText.includes('접안')) status = 'ARRIVED';
        else if (statusText.includes('DEPARTED') || statusText.includes('출항')) status = 'DEPARTED';
        else if (statusText.includes('PLANNED') || statusText) status = 'PLANNED';
        else status = determineStatus(arrived, departed);
        records.push({
          vessel, voyage: $(cells[3]).text().trim() || '-',
          motherVoyage,
          linerCode: $(cells[1]).text().trim() || '-',
          arrived, departed, closing, status,
        });
      });
    });
    return records;
  }

  // CSRF + 쿠키가 있으면 POST 시도
  if (csrfToken && cookies) {
    try {
      const body = `isSearch=Y&page=1&strdStDate=${fmtDate(start)}&strdEdDate=${fmtDate(end)}&route=&tmnCod=P&CSRF_TOKEN=${csrfToken}`;
      const postBuf = execSync(
        `curl -sk '${url}' -X POST -d '${body}' ` +
        `-H 'Content-Type: application/x-www-form-urlencoded' ` +
        `-H 'Cookie: ${cookies}' ` +
        `-H 'Referer: ${url}' ` +
        `-H 'User-Agent: ${UA}' --max-time 30`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
      const records = parsePnitTable(postBuf);
      if (records.length > 0) return records;
    } catch (e) {
      process.stderr.write(`[PNIT] POST failed: ${e.message}\n`);
    }
  }

  // 폴백: GET 응답에서 파싱
  return parsePnitTable(getHtml);
}

// ========== DDCT ==========
async function crawlDdct() {
  const baseUrl = 'https://ds.dongbang.co.kr';
  const loginUrl = `${baseUrl}/com/SsoCtr/login.do`;
  const apiUrl = `${baseUrl}/nxCtr.do`;

  const loginXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">' +
    '<Dataset id="ds_cond"><ColumnInfo>' +
    '<Column id="id" type="STRING" size="256"/>' +
    '<Column id="pw" type="STRING" size="256"/>' +
    '<Column id="locale" type="STRING" size="256"/>' +
    '<Column id="autoLogin" type="STRING" size="256"/>' +
    '</ColumnInfo><Rows><Row>' +
    '<Col id="id">guest</Col>' +
    '<Col id="pw">guest</Col>' +
    '<Col id="locale">ko</Col>' +
    '<Col id="autoLogin">N</Col>' +
    '</Row></Rows></Dataset></Root>';

  let sessionCookie = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const output = execSync(
        `curl -sk -i '${loginUrl}' -X POST ` +
        `-d '${loginXml}' ` +
        `-H 'Content-Type: text/xml; charset=UTF-8' ` +
        `-H 'User-Agent: ${UA}' --max-time 30`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
      for (const line of output.split('\n')) {
        const m = line.match(/^set-cookie:\s*(JSESSIONID=[^;]+)/i);
        if (m) { sessionCookie = m[1].trim(); break; }
      }
      if (sessionCookie) break;
    } catch (e) {
      process.stderr.write(`[DDCT] login error (attempt ${attempt + 1}/3): ${e.message}\n`);
      if (attempt < 2) await sleep(3000 * (attempt + 1));
    }
  }

  if (!sessionCookie) {
    process.stderr.write(`[DDCT] login failed - no session cookie\n`);
    return [];
  }

  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate() - 7);
  const end = new Date(now); end.setDate(end.getDate() + 30);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

  const requestXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">' +
    '<Parameters>' +
    '<Parameter id="method">getList</Parameter>' +
    '<Parameter id="sqlId">ist_020Qry.selectList</Parameter>' +
    '<Parameter id="styZoncd">1510SP</Parameter>' +
    '</Parameters>' +
    '<Dataset id="input1"><ColumnInfo>' +
    '<Column id="istFrdate" type="STRING" size="256"/>' +
    '<Column id="istTodate" type="STRING" size="256"/>' +
    '</ColumnInfo><Rows><Row>' +
    `<Col id="istFrdate">${fmt(start)}</Col>` +
    `<Col id="istTodate">${fmt(end)}</Col>` +
    '</Row></Rows></Dataset></Root>';

  let xml;
  try {
    const buf = execSync(
      `curl -sk '${apiUrl}' -X POST -d '${requestXml}' ` +
      `-H 'Content-Type: text/xml; charset=UTF-8' ` +
      `-H 'Cookie: ${sessionCookie}' ` +
      `-H 'Referer: ${baseUrl}/infoservice/index.html' ` +
      `-H 'User-Agent: ${UA}' --max-time 30`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    xml = buf;
  } catch (e) {
    process.stderr.write(`[DDCT] fetch failed: ${e.message}\n`);
    return [];
  }

  const cleanXml = xml.replace(/\s+xmlns="[^"]*"/g, '');
  const $ = cheerio.load(cleanXml, { xml: true });
  const errorCode = $('Parameter[id="ErrorCode"]').text().trim();
  if (errorCode !== '0') return [];

  const records = [];
  $('Dataset[id="output1"] Row').each((_i, row) => {
    const getCol = (id) => {
      const col = $(row).find(`Col[id="${id}"]`);
      return col.text().trim().replace(/&#32;/g, ' ');
    };
    const cdvName = getCol('cdvName');
    const plvVslvoy = getCol('plvVslvoy');
    if (!cdvName && !plvVslvoy) return;

    const vessel = cdvName || plvVslvoy;
    const motherVoyage = getCol('plvEvoyin') || '';
    const voyage = getCol('plvEvoyout') || motherVoyage || '';
    const arrived = formatDatetime(getCol('plvAtb'));
    const departed = formatDatetime(getCol('plvAtd'));
    const closing = formatDatetime(getCol('cct'));

    const atdYn = getCol('atdYn');
    const atbYn = getCol('atbYn');
    let status;
    if (atdYn === 'Y') status = 'DEPARTED';
    else if (atbYn === 'Y') status = 'ARRIVED';
    else status = 'PLANNED';

    records.push({
      vessel, voyage, motherVoyage,
      linerCode: getCol('cdvOperator') || '-',
      arrived, departed, closing, status,
    });
  });
  return records;
}

// ========== MAIN ==========
const TERMINALS = {
  HBCT: { code: 'HBCT', name: '허치슨 감만(HBCT)', url: 'https://custom.hktl.com', crawl: crawlHbct },
  JUCT: { code: 'JUCT', name: '정일울산(JUCT)', url: 'https://www.juct.co.kr', crawl: crawlJuct },
  PNIT: { code: 'PNIT', name: 'PNIT(부산신항)', url: 'https://www.pnitl.com', crawl: crawlPnit },
  DDCT: { code: 'DDCT', name: '동방대산(DDCT)', url: 'https://ds.dongbang.co.kr', crawl: crawlDdct },
};

async function main() {
  const startTime = Date.now();
  const results = new Map();

  for (const [key, terminal] of Object.entries(TERMINALS)) {
    try {
      const records = await terminal.crawl();
      process.stdout.write(`[${key}] ${records.length} records\n`);
      if (records.length > 0) results.set(key, { terminal, records });
    } catch (err) {
      process.stderr.write(`[${key}] error: ${err.message}\n`);
    }
  }

  if (results.size === 0) {
    process.stdout.write('[Oracle] No records fetched\n');
    return;
  }

  // Supabase 저장
  for (const [key, { terminal, records }] of results) {
    const { error: delErr } = await supabase
      .from('vessel_records').delete().eq('trmn_code', terminal.code);
    if (delErr) {
      process.stderr.write(`[${key}] delete failed: ${delErr.message}\n`);
      continue;
    }
    const rows = records.map((r) => ({
      trmn_code: terminal.code,
      trmn_name: terminal.name,
      trmn_url: terminal.url,
      liner_code: r.linerCode,
      vessel: r.vessel,
      voyage: r.voyage,
      mother_voyage: r.motherVoyage || '',
      arrived_datetime: r.arrived,
      departed_datetime: r.departed,
      closing_datetime: r.closing,
      status_type: r.status,
      updated_at: new Date().toISOString(),
    }));
    const { error: insErr } = await supabase.from('vessel_records').insert(rows);
    if (insErr) process.stderr.write(`[${key}] insert failed: ${insErr.message}\n`);
  }

  // crawl_status 업데이트
  const { count } = await supabase
    .from('vessel_records').select('*', { count: 'exact', head: true });
  const kst = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T');
  await supabase.from('crawl_status')
    .update({ last_updated: kst, total_records: count ?? 0 }).eq('id', 1);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = Array.from(results.entries()).map(([k, v]) => `${k}:${v.records.length}`).join(' ');
  process.stdout.write(`[Oracle] ${results.size}/${Object.keys(TERMINALS).length} updated (${elapsed}s) [${summary}]\n`);
}

main().catch((err) => {
  process.stderr.write(`[Oracle] Fatal: ${err.message}\n`);
  process.exit(1);
});
