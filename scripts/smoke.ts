// Post-start sanity check against a running instance (local dev server or a deployment).
//   npm run smoke -- http://127.0.0.1:5173            (uses ADMIN_TOKEN from .dev.vars)
//   OVE_TOKEN=ovk_... npm run smoke -- https://your.workers.dev
import { existsSync, readFileSync } from 'node:fs'

const base = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/$/, '')

function localAdminToken(): string | undefined {
  if (!existsSync('.dev.vars')) return undefined
  const line = readFileSync('.dev.vars', 'utf8').split(/\r?\n/).find((l) => l.startsWith('ADMIN_TOKEN='))
  return line?.slice('ADMIN_TOKEN='.length)
}

const token = process.env.OVE_TOKEN ?? localAdminToken()
if (!token) {
  console.error('Set OVE_TOKEN or create .dev.vars with ADMIN_TOKEN.')
  process.exit(2)
}

const auth = { Authorization: `Bearer ${token}` }
let failed = 0

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    console.log(`PASS ${name}: ${await fn()}`)
  } catch (err) {
    failed += 1
    console.log(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

await check('health is public', async () => {
  const res = await fetch(`${base}/api/health`)
  expect(res.status === 200, `status ${res.status}`)
  return 'ok'
})

await check('rejects a missing key', async () => {
  const res = await fetch(`${base}/api/session`)
  expect(res.status === 401, `status ${res.status}`)
  return '401'
})

await check('accepts the key', async () => {
  const res = await fetch(`${base}/api/session`, { headers: auth })
  expect(res.status === 200, `status ${res.status}`)
  return `role ${((await res.json()) as { role: string }).role}`
})

await check('lists models', async () => {
  const res = await fetch(`${base}/v1/models`, { headers: auth })
  expect(res.status === 200, `status ${res.status}`)
  const body = (await res.json()) as { data: { id: string }[] }
  return body.data.map((m) => m.id).join(', ')
})

await check('Edge TTS returns MP3', async () => {
  const res = await fetch(`${base}/v1/audio/speech`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'edge-tts', input: '你好，欢迎使用 OpenVoice Edge。' }),
  })
  expect(res.status === 200, `status ${res.status}`)
  const bytes = (await res.arrayBuffer()).byteLength
  expect(res.headers.get('content-type') === 'audio/mpeg' && bytes > 1000, `unexpected audio (${bytes} bytes)`)
  return `${bytes} bytes`
})

// `--full` also calls every SiliconFlow model once (uses a little of your balance).
if (process.argv.includes('--full')) {
  const sentence = '今天天气很好，我们一起去公园散步吧。'
  let sample: Uint8Array | undefined

  async function speak(model: string, input: string): Promise<Uint8Array> {
    const res = await fetch(`${base}/v1/audio/speech`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
    })
    expect(res.status === 200, `status ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.byteLength > 1000, `audio too small (${bytes.byteLength} bytes)`)
    return bytes
  }

  await check('CosyVoice2 TTS', async () => {
    sample = await speak('FunAudioLLM/CosyVoice2-0.5B', sentence)
    return `${sample.byteLength} bytes`
  })

  await check('MOSS-TTSD TTS', async () => {
    const audio = await speak('fnlp/MOSS-TTSD-v0.5', '[S1]你好，今天过得怎么样？[S2]挺好的，谢谢你。')
    return `${audio.byteLength} bytes`
  })

  for (const model of ['FunAudioLLM/SenseVoiceSmall', 'XingChenAGI/XingChenASR-V3.2', 'XingChenAGI/XingChenASR-Diarize-V3.0']) {
    await check(`STT ${model}`, async () => {
      expect(sample !== undefined, 'no sample audio (CosyVoice2 step failed)')
      const form = new FormData()
      form.set('model', model)
      form.set('response_format', 'json')
      form.set('file', new Blob([sample as Uint8Array<ArrayBuffer>], { type: 'audio/mpeg' }), 'sample.mp3')
      const res = await fetch(`${base}/v1/audio/transcriptions`, { method: 'POST', headers: auth, body: form })
      expect(res.status === 200, `status ${res.status}`)
      const body = (await res.json()) as { text: string }
      expect(body.text.length > 0, 'empty transcript')
      return body.text.replace(/\s+/g, ' ').slice(0, 40)
    })
  }
}

process.exit(failed ? 1 : 0)
