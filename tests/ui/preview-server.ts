// Manual browser QA: npm run build, then node tests/ui/preview.mjs
// Uses the real app/routes with in-memory storage and fake upstream responses; localhost only.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createApp } from '../../worker/app.ts'
import { saveOperationLog } from '../../worker/logs/operation-store.ts'
import { ADMIN_TOKEN, audioResponse, edgeUpstream, makeEnv, SF_SPEECH_URL, SF_TRANSCRIBE_URL } from '../worker/helpers.ts'

const env = makeEnv({ SILICONFLOW_API_KEY: 'qa-placeholder-key' })
const upstream = edgeUpstream()
  .on(SF_SPEECH_URL, () => audioResponse('qa-audio'))
  .on(SF_TRANSCRIBE_URL, () => Response.json({ text: '用于界面验收的转写结果。' }))
const app = createApp({ fetch: upstream.fetch })
const assets = path.resolve('dist/client')
let failNext = false
let delayMs = 0

async function seed(mode = 'normal') {
  for (const key of env.kv.data.keys()) if (key.startsWith('op:')) await env.kv.delete(key)
  if (mode === 'empty') return
  const count = mode === 'sparse' ? 140 : 32
  for (let i = 0; i < count; i++) {
    const transcription = mode === 'sparse' ? i === count - 1 : i % 3 === 0
    const failed = mode !== 'sparse' && i % 4 === 0
    await saveOperationLog(env.CONFIG, {
      id: crypto.randomUUID(), createdAt: new Date(Date.now() - i * 60000).toISOString(),
      kind: transcription ? 'transcription' : 'speech', status: failed ? 'failed' : 'success',
      model: transcription ? 'XingChenAGI/XingChenASR-Diarize-V3.0' : 'edge-tts',
      actor: i % 2 ? { id: 'ak:123456789abcdef0', label: i === 1 ? '手机与平板的访问密钥' : '小王的手机' } : { id: 'admin' },
      durationMs: 1200 + i * 385,
      ...(transcription ? { audioBytes: 5120000 } : { inputChars: 500 + i * 13 }),
      ...(failed ? { errorCode: 'upstream_insufficient_balance' as const } : {}),
    })
  }
}
await seed()

const mime: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
}
createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, 'http://127.0.0.1:4175')
    if (url.pathname === '/__test/state' && req.method === 'POST') {
      failNext = url.searchParams.get('fail') === '1'
      delayMs = Number(url.searchParams.get('delay') ?? 0)
      if (url.searchParams.has('mode')) await seed(url.searchParams.get('mode')!)
      res.end('ok')
      return
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
      if (url.pathname === '/api/admin/logs') {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
        if (failNext) {
          failNext = false
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'internal_error', message: 'QA failure', type: 'api_error' } }))
          return
        }
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const response = await app.request(url.toString(), {
        method: req.method, headers: req.headers as Record<string, string>,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      }, env)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
      return
    }
    const filename = path.resolve(assets, `.${decodeURIComponent(url.pathname)}`)
    if (!filename.startsWith(assets + path.sep)) { res.writeHead(404); res.end(); return }
    try {
      const body = await readFile(filename)
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(await readFile(path.join(assets, 'index.html')))
    }
  } catch {
    res.writeHead(500)
    res.end('QA server error')
  }
}).listen(4175, '127.0.0.1', () => {
  console.log(`QA preview: http://127.0.0.1:4175/admin?tab=logs (access key: ${ADMIN_TOKEN})`)
})
