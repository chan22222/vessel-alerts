import type { VesselRecord } from '../types.js'
import { TERMINALS } from '../types.js'
import { setRecords, resetSeqCounter } from '../store.js'
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
import { HbctCrawler } from './hbct.js'
import { BnmtCrawler } from './bnmt.js'
import { JuctCrawler } from './juct.js'
import { PncCrawler } from './pnc.js'
import { DdctCrawler } from './ddct.js'
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
    new HbctCrawler(TERMINALS.HBCT),
    new BnmtCrawler(TERMINALS.BNMT),
    new JuctCrawler(TERMINALS.JUCT),
    new PncCrawler(TERMINALS.PNC),
    new DdctCrawler(TERMINALS.DDCT),
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

  const allRecords: VesselRecord[] = []
  const countsByTerminal: Record<string, number> = {}
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allRecords.push(...result.value)
      const code = result.value[0]?.trmnCode || 'unknown'
      countsByTerminal[code] = result.value.length
    }
  }

  allRecords.sort((a, b) => {
    const dateA = a.arrivedDatetime || '9999'
    const dateB = b.arrivedDatetime || '9999'
    return dateA.localeCompare(dateB)
  })

  setRecords(allRecords)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const terminalSummary = Object.entries(countsByTerminal).map(([k,v]) => `${k}:${v}`).join(' ')
  const successCount = Object.keys(countsByTerminal).length
  const msg = `[Crawler] ${allRecords.length} records from ${successCount}/${crawlers.length} terminals (${elapsed}s) [${terminalSummary}]\n`
  process.stdout.write(msg)
}
