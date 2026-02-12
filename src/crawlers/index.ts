import type { VesselRecord } from '../types.js'
import { TERMINALS } from '../types.js'
import { mergeRecords, resetSeqCounter } from '../store.js'
import { BaseCrawler } from './base.js'

import { BnctCrawler } from './bnct.js'
import { HjncCrawler } from './hjnc.js'
import { PctcCrawler } from './pctc.js'
import { UnctCrawler } from './unct.js'
import { HpntCrawler } from './hpnt.js'
import { PnitCrawler } from './pnit.js'
import { E1ctCrawler } from './e1ct.js'
import { HjitCrawler } from './hjit.js'
import { IctCrawler } from './ict.js'
import { SnctCrawler } from './snct.js'
import { GwctCrawler } from './gwct.js'
import { KitlCrawler } from './kitl.js'
import { BnmtCrawler } from './bnmt.js'
import { IfpcCrawler } from './ifpc.js'
import { PnctCrawler } from './pnct.js'
import { BctCrawler } from './bct.js'

function createCrawlers(): BaseCrawler[] {
  return [
    new BnctCrawler(TERMINALS.BNCT),
    new HjncCrawler(TERMINALS.HJNC),
    new PctcCrawler(TERMINALS.PCTC),
    new UnctCrawler(TERMINALS.UNCT),
    new HpntCrawler(TERMINALS.HPNT),
    new PnitCrawler(TERMINALS.PNIT),
    new E1ctCrawler(TERMINALS.E1CT),
    new HjitCrawler(TERMINALS.HJIT),
    new IctCrawler(TERMINALS.ICT),
    new SnctCrawler(TERMINALS.SNCT),
    new GwctCrawler(TERMINALS.GWCT),
    new KitlCrawler(TERMINALS.KITL),
    new BnmtCrawler(TERMINALS.BNMT),
    new IfpcCrawler(TERMINALS.IFPC),
    new PnctCrawler(TERMINALS.PNCT),
    new BctCrawler(TERMINALS.BCT),
  ]
}

export async function runAllCrawlers(): Promise<void> {
  const crawlers = createCrawlers()
  const startTime = Date.now()
  resetSeqCounter()

  const results = await Promise.allSettled(
    crawlers.map(async (crawler) => {
      const name = crawler.constructor.name
      try {
        const records = await crawler.crawl()
        if (records.length === 0) {
          process.stderr.write(`[${name}] returned 0 records\n`)
        }
        return records
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[${name}] crawl failed: ${msg}\n`)
        return [] as VesselRecord[]
      }
    })
  )

  const newRecordsByTerminal = new Map<string, VesselRecord[]>()
  const countsByTerminal: Record<string, number> = {}
  const failedTerminals: string[] = []

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      const code = result.value[0]?.trmnCode || 'unknown'
      newRecordsByTerminal.set(code, result.value)
      countsByTerminal[code] = result.value.length
    } else if (result.status === 'fulfilled' && result.value.length === 0) {
      // 크롤링은 됐지만 0건 → 실패 터미널로 간주하여 이전 데이터 유지
    }
  }

  const totalCount = await mergeRecords(newRecordsByTerminal)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const terminalSummary = Object.entries(countsByTerminal).map(([k,v]) => `${k}:${v}`).join(' ')
  const successCount = Object.keys(countsByTerminal).length
  const msg = `[Crawler] ${totalCount} records (${successCount}/${crawlers.length} updated) (${elapsed}s) [${terminalSummary}]\n`
  process.stdout.write(msg)
}
