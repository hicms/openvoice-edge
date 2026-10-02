import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOG_RETENTION_DAYS, type OperationLog } from '../../shared/operation-logs.ts'
import { listOperationLogs, saveOperationLog } from '../../worker/logs/operation-store.ts'
import { makeEnv } from './helpers.ts'

const started = Date.parse('2026-10-02T07:00:00Z')
function entry(index: number, patch: Partial<OperationLog> = {}): OperationLog {
  return {
    id: crypto.randomUUID(), createdAt: new Date(started + index * 1000).toISOString(),
    kind: 'speech', status: 'success', actor: { id: 'admin' }, durationMs: 12, ...patch,
  }
}

afterEach(() => vi.useRealTimers())

describe('operation log storage', () => {
  it('retains concurrent entries with identical completion times, newest first', async () => {
    const env = makeEnv()
    const rows = [entry(1), entry(2), entry(2), entry(3)]
    await Promise.all(rows.map((row) => saveOperationLog(env.CONFIG, row)))
    const { logs, cursor } = await listOperationLogs(env.CONFIG, {})
    expect(logs).toHaveLength(4)
    expect(new Set(logs.map((row) => row.id)).size).toBe(4)
    expect(logs.map((row) => row.createdAt)).toEqual([3, 2, 2, 1].map((i) => new Date(started + i * 1000).toISOString()))
    expect(cursor).toBeNull()
  })

  it('expires records after 30 days and keeps metadata below the KV limit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(started)
    const env = makeEnv()
    const row = entry(0, {
      actor: { id: 'ak:123456789abcdef0', label: '汉'.repeat(40) },
      model: 'XingChenAGI/XingChenASR-Diarize-V3.0', errorCode: 'upstream_insufficient_balance',
      status: 'failed', audioBytes: 50 * 1024 * 1024,
    })
    await saveOperationLog(env.CONFIG, row)
    const stored = [...env.kv.data.values()][0]!
    expect(stored.expiration).toBe(started / 1000 + LOG_RETENTION_DAYS * 86400)
    expect(new TextEncoder().encode(JSON.stringify(stored.metadata)).byteLength).toBeLessThan(1024)
    expect((await listOperationLogs(env.CONFIG, {})).logs).toHaveLength(1)
    vi.setSystemTime(started + LOG_RETENTION_DAYS * 86400000)
    expect((await listOperationLogs(env.CONFIG, {})).logs).toHaveLength(0)
  })

  it('paginates and filters without skipping any matches or exposing other KV keys', async () => {
    const env = makeEnv()
    await env.kv.put('settings', 'private settings', { metadata: { private: true } })
    const rows = Array.from({ length: 160 }, (_, i) => entry(i, {
      kind: i % 2 ? 'transcription' : 'speech', status: i % 3 ? 'success' : 'failed',
    }))
    await Promise.all(rows.map((row) => saveOperationLog(env.CONFIG, row)))
    const result: OperationLog[] = []
    let cursor: string | undefined
    do {
      const page = await listOperationLogs(env.CONFIG, { kind: 'transcription', status: 'success', cursor })
      expect(page.logs.length).toBeLessThanOrEqual(25)
      result.push(...page.logs)
      cursor = page.cursor ?? undefined
    } while (cursor)
    expect(result.map((row) => row.id)).toEqual(rows.toReversed().filter((row) => row.kind === 'transcription' && row.status === 'success').map((row) => row.id))
  })

  it('bounds sparse scans and offers continuation even when no matches were found', async () => {
    const env = makeEnv()
    const oldest = entry(0, { kind: 'transcription' })
    await saveOperationLog(env.CONFIG, oldest)
    await Promise.all(Array.from({ length: 130 }, (_, i) => saveOperationLog(env.CONFIG, entry(i + 1))))
    const scans = vi.spyOn(env.kv, 'list')
    const first = await listOperationLogs(env.CONFIG, { kind: 'transcription' })
    expect(first.logs).toEqual([])
    expect(first.cursor).toBeTruthy()
    expect(scans).toHaveBeenCalledTimes(5)
    const next = await listOperationLogs(env.CONFIG, { kind: 'transcription', cursor: first.cursor! })
    expect(next.logs).toEqual([oldest])
    expect(next.cursor).toBeNull()
  })

  it('continues past an empty KV page when list_complete is false', async () => {
    const env = makeEnv()
    const row = entry(1)
    await saveOperationLog(env.CONFIG, row)
    vi.spyOn(env.kv, 'list').mockResolvedValueOnce({ keys: [], list_complete: false, cursor: 'op:0', cacheStatus: null })
    expect((await listOperationLogs(env.CONFIG, {})).logs).toEqual([row])
  })
})
