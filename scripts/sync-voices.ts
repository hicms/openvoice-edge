// Regenerates worker/data/edge-voices.json from the live Edge voice list.
// Run `npm run sync-voices` when Microsoft adds or retires voices.
import { writeFileSync } from 'node:fs'
import type { VoiceInfo } from '../shared/models.ts'
import { createEdgeClient } from '../worker/providers/tts/edge.ts'

const OUT = new URL('../worker/data/edge-voices.json', import.meta.url)

const raw = await createEdgeClient().listVoices()
// "Dragon HD" voices (ids containing ":") return truncated audio through this endpoint, so they are left out.
const voices: VoiceInfo[] = raw
  .filter((v) => /^[A-Za-z0-9-]+$/.test(v.ShortName))
  .map((v) => ({
    id: v.ShortName,
    name: (v.LocalName ?? v.ShortName).trim(),
    locale: v.Locale,
    gender: v.Gender.toLowerCase() === 'male' ? ('male' as const) : ('female' as const),
    ...(v.StyleList?.length ? { styles: v.StyleList } : {}),
  }))
  .sort((a, b) => a.locale.localeCompare(b.locale) || a.id.localeCompare(b.id))

// One voice per line keeps diffs readable when the list changes.
writeFileSync(OUT, `[\n${voices.map((v) => JSON.stringify(v)).join(',\n')}\n]\n`)
console.log(`Wrote ${voices.length} voices to worker/data/edge-voices.json`)
