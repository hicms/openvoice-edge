import { useEffect, useState } from 'react'
import type { OperationLogQuery, OperationLogsPage } from '../../../shared/operation-logs.ts'
import { apiJson } from '@/lib/api'

export function useOperationLogs() {
  const [request, setRequest] = useState<OperationLogQuery & { revision: number }>({ revision: 0 })
  const [result, setResult] = useState<{ query: string; revision: number; page?: OperationLogsPage; error?: unknown } | null>(null)
  const { kind, status } = request
  const query = new URLSearchParams({ ...(kind ? { kind } : {}), ...(status ? { status } : {}) }).toString()

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams(query)
    if (request.cursor) params.set('cursor', request.cursor)
    apiJson<OperationLogsPage>(`/api/admin/logs?${params}`, { signal: controller.signal }).then(
      (page) => {
        if (controller.signal.aborted) return
        setResult((previous) => {
          const logs = request.cursor && previous?.query === query && previous.page
            ? [...new Map([...previous.page.logs, ...page.logs].map((log) => [log.id, log])).values()]
            : page.logs
          return { query, revision: request.revision, page: { ...page, logs } }
        })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setResult((previous) => ({ query, revision: request.revision, error, page: previous?.query === query ? previous.page : undefined }))
      },
    )
    return () => controller.abort()
  }, [query, request])

  // Filter changes never render the previous filter's rows or reuse its pagination cursor.
  const page = result?.query === query ? result.page : undefined
  const loading = result?.revision !== request.revision
  function load(cursor?: string) {
    setRequest((previous) => ({ ...previous, cursor, revision: previous.revision + 1 }))
  }
  return {
    kind,
    status,
    setKind: (next: OperationLogQuery['kind']) => setRequest((previous) => ({ ...previous, kind: next, cursor: undefined, revision: previous.revision + 1 })),
    setStatus: (next: OperationLogQuery['status']) => setRequest((previous) => ({ ...previous, status: next, cursor: undefined, revision: previous.revision + 1 })),
    page,
    error: loading ? undefined : result?.error,
    loading,
    refresh: () => load(),
    loadMore: () => page?.cursor && load(page.cursor),
    retry: () => load(request.cursor),
  }
}
