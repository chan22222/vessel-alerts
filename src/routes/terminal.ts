import { Router } from 'express'
import { queryRecords, getLastUpdated, getTerminalCodes } from '../store.js'

const router = Router()

router.get('/terminal/getAll', (req, res) => {
  const pageSize = parseInt(String(req.query.pageSize)) || 20
  const pageNo = parseInt(String(req.query.pageNo)) || 1
  const searchValue1 = req.query.searchValue1 as string | undefined
  const trmnCode = req.query.trmnCode as string | undefined

  const result = queryRecords({ pageSize, pageNo, searchValue1, trmnCode })
  res.json(result)
})

router.get('/terminal/codes', (_req, res) => {
  res.json(getTerminalCodes())
})

router.get('/terminal/status', (_req, res) => {
  res.json({
    status: 'ok',
    lastUpdated: getLastUpdated(),
  })
})

router.get('/terminal/debug', (_req, res) => {
  const allRecords = queryRecords({ pageSize: 9999, pageNo: 1 })
  const codes: Record<string, number> = {}
  for (const r of allRecords.resultObject.list) {
    codes[r.trmnCode] = (codes[r.trmnCode] || 0) + 1
  }
  res.json({
    totalStored: allRecords.resultObject.pageInfo.totalCount,
    byTerminal: codes,
  })
})

export default router
