import { AppError } from '../../shared/errors.ts'
import type { AccessKeyView, CreatedAccessKey } from '../../shared/schemas.ts'
import { randomBytes, sha256, timingSafeEqualText, toBase64Url, toHex } from '../lib/crypto.ts'

const PREFIX = 'ak:'
const KEY_PATTERN = /^ovk_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/
export const MAX_ACCESS_KEYS = 50

interface StoredKey {
  id: string
  label: string
  /** Hex SHA-256 of the secret part. The secret is high-entropy, so a fast hash is enough. */
  hash: string
  createdAt: string
}

export async function createAccessKey(kv: KVNamespace, label: string): Promise<CreatedAccessKey> {
  const existing = await kv.list({ prefix: PREFIX })
  if (existing.keys.length >= MAX_ACCESS_KEYS) {
    throw new AppError('invalid_request', `At most ${MAX_ACCESS_KEYS} access keys are allowed; revoke one first.`)
  }
  const id = toHex(randomBytes(8))
  const secret = toBase64Url(randomBytes(32))
  const record: StoredKey = {
    id,
    label,
    hash: toHex(await sha256(secret)),
    createdAt: new Date().toISOString(),
  }
  await kv.put(PREFIX + id, JSON.stringify(record), { metadata: { label, createdAt: record.createdAt } })
  return { id, label, createdAt: record.createdAt, key: `ovk_${id}_${secret}` }
}

export async function listAccessKeys(kv: KVNamespace): Promise<AccessKeyView[]> {
  const { keys } = await kv.list<{ label: string; createdAt: string }>({ prefix: PREFIX })
  return keys
    .map((k) => ({ id: k.name.slice(PREFIX.length), label: k.metadata?.label ?? '', createdAt: k.metadata?.createdAt ?? '' }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function revokeAccessKey(kv: KVNamespace, id: string): Promise<boolean> {
  if (!/^[0-9a-f]{16}$/.test(id)) return false
  if ((await kv.get(PREFIX + id)) === null) return false
  await kv.delete(PREFIX + id)
  return true
}

/** Returns the key id when `token` is a live access key. */
export async function verifyAccessKey(kv: KVNamespace, token: string): Promise<string | null> {
  const match = KEY_PATTERN.exec(token)
  if (!match) return null
  const [, id, secret] = match
  const record = await kv.get<StoredKey>(PREFIX + id, 'json')
  if (!record) return null
  const ok = await timingSafeEqualText(toHex(await sha256(secret!)), record.hash)
  return ok ? id! : null
}
