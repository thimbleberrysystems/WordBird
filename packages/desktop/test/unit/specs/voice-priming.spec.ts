/**
 * VoicePriming — few-shot voice exemplars for drafting agents (SOTA
 * audit feature 2). Pins the pure module; ContextBuilder wiring +
 * drafter/steward doctrine are pinned in agent-context / prompt specs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildVoiceSection,
  VOICE_SECTION_HEADER,
  VOICE_FILE_BUDGET,
  VOICE_SECTION_BUDGET,
  MAX_VOICE_FILES
} from '../../../src/main/services/novel/VoicePriming'

let root: string
const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-voice-'))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('buildVoiceSection', () => {
  it('returns empty when there are no exemplars', () => {
    expect(buildVoiceSection(root)).toBe('')
  })

  it('inlines exemplar prose under the VOICE EXEMPLARS header', () => {
    write('bible/voice/opening.md', 'The rain came sideways, the way it always did in March.')
    const section = buildVoiceSection(root)
    expect(section).toContain(VOICE_SECTION_HEADER)
    expect(section).toContain('rain came sideways')
    expect(section).toContain('exemplar 1')
  })

  it('strips front matter, keeping only the prose', () => {
    write('bible/voice/sample.md', '---\ntitle: A good one\n---\nShe counted the gulls twice.')
    const section = buildVoiceSection(root)
    expect(section).toContain('counted the gulls twice')
    expect(section).not.toContain('title: A good one')
  })

  it('numbers multiple exemplars in filename order', () => {
    write('bible/voice/a-first.md', 'First voice sample here.')
    write('bible/voice/b-second.md', 'Second voice sample here.')
    const section = buildVoiceSection(root)
    expect(section).toContain('exemplar 1')
    expect(section).toContain('exemplar 2')
    expect(section.indexOf('First voice sample')).toBeLessThan(
      section.indexOf('Second voice sample')
    )
  })

  it('caps a single long exemplar at the per-file budget', () => {
    write('bible/voice/long.md', 'x'.repeat(VOICE_FILE_BUDGET + 3000))
    const section = buildVoiceSection(root)
    expect(section).toContain('…')
    expect(section.length).toBeLessThan(VOICE_FILE_BUDGET + 400)
  })

  it('stops adding exemplars once the section budget is reached', () => {
    for (let i = 0; i < MAX_VOICE_FILES; i += 1) {
      write(`bible/voice/${i}.md`, 'y'.repeat(VOICE_FILE_BUDGET))
    }
    const section = buildVoiceSection(root)
    expect(section.length).toBeLessThanOrEqual(VOICE_SECTION_BUDGET + 500)
  })

  it('ignores empty exemplar files', () => {
    write('bible/voice/blank.md', '---\ntitle: x\n---\n')
    expect(buildVoiceSection(root)).toBe('')
  })
})
