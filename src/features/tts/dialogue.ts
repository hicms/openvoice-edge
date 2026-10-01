export type SpeakerId = 1 | 2

export interface Turn {
  speaker: SpeakerId
  text: string
}

export function emptyDialogue(): Turn[] {
  return [
    { speaker: 1, text: '' },
    { speaker: 2, text: '' },
  ]
}

/** `[S1]hello[S2]hi` — the script format MOSS-TTSD expects. Blank turns are dropped. */
export function turnsToScript(turns: readonly Turn[]): string {
  return turns
    .map((t) => ({ ...t, text: t.text.trim() }))
    .filter((t) => t.text)
    .map((t) => `[S${t.speaker}]${t.text}`)
    .join('')
}

export function scriptToTurns(script: string): Turn[] {
  const turns: Turn[] = []
  const pattern = /\[S([12])\]([^[]*)/g
  for (const match of script.matchAll(pattern)) {
    turns.push({ speaker: match[1] === '2' ? 2 : 1, text: match[2]!.trim() })
  }
  if (turns.length > 0) return turns
  return script.trim() ? [{ speaker: 1, text: script.trim() }] : emptyDialogue()
}
