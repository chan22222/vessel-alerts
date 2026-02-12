import express from 'express'
import cron from 'node-cron'
import { runAllCrawlers } from './crawlers/index.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

async function start(): Promise<void> {
  process.stdout.write(`Starting vessel-alerts crawler on port ${PORT}...\n`)

  process.stdout.write('Running initial crawl...\n')
  await runAllCrawlers()

  cron.schedule('*/15 * * * *', async () => {
    process.stdout.write('[Cron] Starting scheduled crawl...\n')
    await runAllCrawlers()
  })

  app.listen(PORT, () => {
    process.stdout.write(`Crawler running at http://localhost:${PORT}\n`)
  })
}

start().catch((err) => {
  process.stderr.write(`Failed to start: ${err}\n`)
  process.exit(1)
})
