import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * The renderer must not talk to the network directly — every provider/model
 * call goes through main via `window.electron.ai.*` (main owns axios). The AI
 * settings panel used to `fetch()` Ollama's /api/show itself; that moved to
 * the `mt::ai:ollama-model-exists` IPC. This is a source-level guard because
 * the property is invisible at runtime until someone reintroduces a raw call.
 */

const rendererRoot = path.resolve(__dirname, '../../..', 'src/renderer/src')

const walk = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('the renderer makes no direct network calls', () => {
  const files = walk(rendererRoot)

  it('no fetch(/XMLHttpRequest/WebSocket in renderer source', () => {
    const offenders: string[] = []
    // Match a network CALL, not the word in a comment/identifier: `fetch(`,
    // `new XMLHttpRequest`, `new WebSocket`.
    const re = /(^|[^.\w])fetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket/
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      for (const [i, line] of src.split('\n').entries()) {
        // Skip line comments so a doc reference doesn't trip the guard.
        if (/^\s*(\/\/|\*)/.test(line)) continue
        if (re.test(line)) offenders.push(`${path.relative(rendererRoot, file)}:${i + 1}`)
      }
    }
    expect(offenders, `direct network calls in renderer: ${offenders.join(', ')}`).toEqual([])
  })

  it('the AI settings panel probes Ollama through the IPC, not fetch', () => {
    const src = fs.readFileSync(path.join(rendererRoot, 'prefComponents/ai/index.vue'), 'utf8')
    expect(src).toContain('ollamaModelExists')
    expect(src).not.toMatch(/fetch\s*\(/)
  })
})
