/**
 * GitHub Actions 전용 크롤링 스크립트
 * Railway에서 IP 차단된 터미널(PNC, JUCT, DDCT)만 크롤링하여 Supabase에 저장
 */
import { TERMINALS } from './types.js'
import { mergeRecords, resetSeqCounter } from './store.js'
import type { VesselRecord } from './types.js'

import { PncCrawler } from './crawlers/pnc.js'
import { JuctCrawler } from './crawlers/juct.js'
import { DdctCrawler } from './crawlers/ddct.js'

async function main(): Promise<void> {
  const startTime = Date.now()
  resetSeqCounter()

  const crawlers = [
    new PncCrawler(TERMINALS.PNC),
    new JuctCrawler(TERMINALS.JUCT),
    new DdctCrawler(TERMINALS.DDCT),
  ]

  const results = await Promise.allSettled(
    crawlers.map(async (crawler) => {
      const name = crawler.constructor.name
      try {
        const records = await crawler.crawl()
        process.stdout.write(`[${name}] ${records.length} records\n`)
        return records
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[${name}] failed: ${msg}\n`)
        return [] as VesselRecord[]
      }
    })
  )

  const newByTerminal = new Map<string, VesselRecord[]>()
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      const code = result.value[0].trmnCode
      newByTerminal.set(code, result.value)
    }
  }

  if (newByTerminal.size === 0) {
    process.stdout.write('[Actions] No records fetched from any terminal\n')
    process.exit(0)
  }

  const totalCount = await mergeRecords(newByTerminal)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const summary = Array.from(newByTerminal.entries()).map(([k, v]) => `${k}:${v.length}`).join(' ')
  process.stdout.write(`[Actions] ${totalCount} total (${newByTerminal.size}/3 updated) (${elapsed}s) [${summary}]\n`)
}

main().catch((err) => {
  process.stderr.write(`[Actions] Fatal: ${err}\n`)
  process.exit(1)
})
