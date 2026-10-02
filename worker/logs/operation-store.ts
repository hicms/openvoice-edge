import { LOG_RETENTION_DAYS, type OperationLog, type OperationLogQuery, type OperationLogsPage } from '../../shared/operation-logs.ts'

const PREFIX = 'op:'
const PAGE_SIZE = 25
const MAX_SCAN_PAGES = 5

export async function saveOperationLog(kv: KVNamespace, log: OperationLog): Promise<void> {
  // KV sorts lexicographically. Unique, immutable keys avoid concurrent read/modify/write loss.
  const reverseTime = String(9999999999999 - Date.parse(log.createdAt)).padStart(13, '0')
  await kv.put(`${PREFIX}${reverseTime}:${log.id}`, '', {
    metadata: log,
    expirationTtl: LOG_RETENTION_DAYS * 24 * 60 * 60,
  })
}

export async function listOperationLogs(kv: KVNamespace, query: OperationLogQuery): Promise<OperationLogsPage> {
  const logs: OperationLog[] = []
  let cursor = query.cursor
  for (let scan = 0; scan < MAX_SCAN_PAGES; scan++) {
    // Never fetch more matches than fit: the returned cursor must not skip undisplayed records.
    const page = await kv.list<OperationLog>({ prefix: PREFIX, limit: PAGE_SIZE - logs.length, cursor })
    for (const key of page.keys) {
      const log = key.metadata
      if (log && (!query.kind || log.kind === query.kind) && (!query.status || log.status === query.status)) logs.push(log)
    }
    if (page.list_complete) return { logs, cursor: null }
    cursor = page.cursor
    if (logs.length === PAGE_SIZE) break
  }
  // A sparse/expired page can be empty and still have older records to scan.
  return { logs, cursor: cursor ?? null }
}
