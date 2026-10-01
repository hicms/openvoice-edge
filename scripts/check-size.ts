import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LINES = 1000
const ROOTS = ['src', 'worker', 'shared', 'scripts', 'tests']
const GENERATED = [join('src', 'components', 'ui')]

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (GENERATED.includes(path)) continue
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.(ts|tsx)$/.test(name)) yield path
  }
}

const tooLong: string[] = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n').length
    if (lines > MAX_LINES) tooLong.push(`${file}: ${lines} lines`)
  }
}

if (tooLong.length > 0) {
  console.error(`Files over ${MAX_LINES} lines:\n${tooLong.join('\n')}`)
  process.exit(1)
}
console.log(`All hand-written source files are within ${MAX_LINES} lines.`)
