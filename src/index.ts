import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import terminalRoutes from './routes/terminal.js'
import { runAllCrawlers } from './crawlers/index.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(cors({
  origin: [
    'https://shipdago.com',
    'https://www.shipdago.com',
    'http://localhost:3000',
  ],
}))
app.use(express.json())
app.use('/api', terminalRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

async function start(): Promise<void> {
  process.stdout.write(`Starting vessel-alerts server on port ${PORT}...\n`)

  process.stdout.write('Running initial crawl...\n')
  await runAllCrawlers()

  cron.schedule('*/10 * * * *', async () => {
    process.stdout.write('[Cron] Starting scheduled crawl...\n')
    await runAllCrawlers()
  })

  app.listen(PORT, () => {
    process.stdout.write(`Server running at http://localhost:${PORT}\n`)
    process.stdout.write(`API endpoint: http://localhost:${PORT}/api/terminal/getAll\n`)
  })
}

start().catch((err) => {
  process.stderr.write(`Failed to start: ${err}\n`)
  process.exit(1)
})
