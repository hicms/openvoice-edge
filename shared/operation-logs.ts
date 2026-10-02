import { z } from 'zod'
import type { ErrorCode } from './errors.ts'

export const LOG_RETENTION_DAYS = 30

export const OperationLogQuerySchema = z.object({
  kind: z.enum(['speech', 'transcription']).optional(),
  status: z.enum(['success', 'failed']).optional(),
  cursor: z.string().min(1).max(2048).optional(),
})
export type OperationLogQuery = z.infer<typeof OperationLogQuerySchema>
export type OperationKind = NonNullable<OperationLogQuery['kind']>

/** Filled only from parsed input and the model catalog, never arbitrary request fields. */
export interface OperationDetails {
  model?: string
  inputChars?: number
  audioBytes?: number
}

/** One completed, authenticated API request. No content, filenames or credentials. */
export interface OperationLog extends OperationDetails {
  id: string
  createdAt: string
  kind: OperationKind
  status: 'success' | 'failed'
  actor: { id: string; label?: string }
  durationMs: number
  errorCode?: ErrorCode
}

export interface OperationLogsPage {
  logs: OperationLog[]
  cursor: string | null
}
