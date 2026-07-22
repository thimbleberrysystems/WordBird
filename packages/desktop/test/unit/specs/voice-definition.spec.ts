/**
 * VOICE DEFINITION — the fix for "all my novels sound the same".
 *
 * The cause was NOT shared memory between projects (agent state is
 * per-project and was verified isolated). It was a shared TEMPLATE: the
 * scaffolded bible/style.md wrote its examples as prose —
 *
 *     - Narrator voice: (e.g. wry, restrained; no purple prose)
 *
 * — which every drafter read as the actual instruction. Unrelated projects
 * that never filled the page in drafted against one identical voice
 * directive (and one identical banned-word list), with no cross-project
 * contamination required.
 *
 * Three changes are pinned here:
 *   1. examples moved into HTML comments, so a blank field is honestly blank
 *   2. bible/voice/ scaffolded + the onboarding playbook asks for exemplars
 *   3. ProjectHealth flags an unfilled style page with no exemplars
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import {
  parseBannedTerms,
  stripHtmlComments,
  unfilledStyleFields
} from '../../../src/main/services/novel/ProseLint'
import {
  COMMON_FOLDERS,
  FLAVOR_TEMPLATES,
  STYLE_TEMPLATE
} from '../../../src/main/services/novel/projectScaffold'
import { checkProjectHealth, clearHealthCache } from '../../../src/main/services/novel/ProjectHealth'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'

/** Captures the system prompt without a network call (orchestrator.spec pattern). */
class ScriptedModel {
  calls: BaseMessage[][] = []

  bindTools(): ScriptedModel {
    return this
  }

  async invoke(messages: BaseMessage[]): Promise<AIMessage> {
    this.calls.push(messages)
    return new AIMessage('done')
  }
}

/** The template exactly as it shipped when the bug was reported. */
const LEGACY_STYLE_TEMPLATE =
  '# Style Guide\n\n' +
  '## Voice & tense\n\n- Point of view: (e.g. third limited, single POV per scene)\n' +
  '- Tense: (e.g. past)\n- Narrator voice: (e.g. wry, restrained; no purple prose)\n\n' +
  '## Prose rules\n\n- Dialogue tags: (e.g. said/asked only)\n' +
  '- Words/phrases to avoid: (e.g. suddenly, very, "little did they know")\n' +
  '- Profanity/content boundaries:\n\n' +
  '## Character voices\n\n- (Name): speech habits, vocabulary, rhythm\n'

describe('style-page parsing', () => {
  it('strips HTML comments — guidance to the writer is never canon', () => {
    const stripped = stripHtmlComments('a\n<!-- hidden\n  lines -->\nb')
    expect(stripped).toContain('a')
    expect(stripped).toContain('b')
    expect(stripped).not.toContain('hidden')
  })

  it('unfilledStyleFields reports blank fields and ignores answered ones', () => {
    const partly = '## Voice\n\n- Point of view: third limited\n- Tense:\n- Narrator voice:  \n'
    expect(unfilledStyleFields(partly)).toEqual(['Tense', 'Narrator voice'])
  })

  it('a field answered INSIDE a comment still counts as unfilled', () => {
    // The whole point of the redesign: commented text is not an answer.
    const commented = '- Tense:\n<!-- - Tense: past -->\n'
    expect(unfilledStyleFields(commented)).toEqual(['Tense'])
  })

  it('banned terms are never harvested from commented examples', () => {
    const page = '## Words to avoid\n\n<!-- e.g. suddenly, very -->\n- moist\n'
    expect(parseBannedTerms(page)).toEqual(['moist'])
  })
})

describe('the shipped scaffold cannot dictate a voice', () => {
  it('STYLE_TEMPLATE states no voice of its own — every field is blank', () => {
    // Each field is present and unanswered, so the writer sees the prompt
    // but no drafter can mistake an example for a decision.
    expect(unfilledStyleFields(STYLE_TEMPLATE)).toEqual([
      'Point of view',
      'Tense',
      'Narrator voice',
      'Dialogue tags',
      'Words/phrases to avoid',
      'Profanity/content boundaries'
    ])
    // Nothing outside a comment may assert an example.
    expect(stripHtmlComments(STYLE_TEMPLATE)).not.toMatch(/e\.g\./)
    expect(stripHtmlComments(STYLE_TEMPLATE)).not.toMatch(/wry|restrained|purple prose/i)
  })

  it('STYLE_TEMPLATE bans no words', () => {
    // Guards a future template that might place its examples under an
    // "avoid" heading, where parseBannedTerms WOULD harvest them. (The
    // legacy template escaped this by luck: "Words/phrases to avoid:" does
    // not match the parser's line-initial `avoid:` form.)
    expect(parseBannedTerms(STYLE_TEMPLATE)).toEqual([])
  })

  it('NEGATIVE CONTROL: the legacy template fails these checks', () => {
    // Proves the assertions above have teeth rather than passing vacuously:
    // the old page asserted a narrator voice in plain prose, and its fields
    // did not read as unfilled, so nothing ever flagged it.
    expect(unfilledStyleFields(LEGACY_STYLE_TEMPLATE)).not.toContain('Narrator voice')
    expect(unfilledStyleFields(LEGACY_STYLE_TEMPLATE)).not.toContain('Tense')
    expect(stripHtmlComments(LEGACY_STYLE_TEMPLATE)).toMatch(/wry, restrained/)
  })

  it('every flavor scaffolds bible/voice/ for exemplars', () => {
    expect(COMMON_FOLDERS).toContain('bible/voice')
    for (const flavor of ['chapters-scenes', 'scene-pool', 'flat'] as const) {
      expect(FLAVOR_TEMPLATES[flavor].folders, flavor).toContain('bible/voice')
      expect(FLAVOR_TEMPLATES[flavor].files['bible/style.md'], flavor).toBe(STYLE_TEMPLATE)
    }
  })
})

describe('ProjectHealth flags an undefined voice', () => {
  let root: string

  const write = (relative: string, content: string): void => {
    const full = path.join(root, relative)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }

  const styleFinding = async(): Promise<{ severity: string; items?: string[] } | undefined> => {
    clearHealthCache()
    const report = await checkProjectHealth(root)
    return report.findings.find((f) => f.id === 'style-unfilled')
  }

  beforeEach(() => {
    clearHealthCache()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-voice-'))
    write('.wordbird/project.json', JSON.stringify({ name: 'V', flavor: 'chapters-scenes' }))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('warns when a scaffolded style page is untouched and no exemplars exist', async() => {
    write('bible/style.md', STYLE_TEMPLATE)
    const finding = await styleFinding()
    expect(finding?.severity).toBe('warn')
    expect(finding?.items).toContain('Narrator voice')
    expect(finding?.items).toContain('Tense')
  })

  it('goes quiet once the writer answers the fields', async() => {
    write(
      'bible/style.md',
      '## Voice & tense\n\n- Point of view: third limited\n- Tense: past\n' +
        '- Narrator voice: dry, close\n- Dialogue tags: said only\n' +
        '- Words/phrases to avoid: suddenly\n- Profanity/content boundaries: none\n'
    )
    expect(await styleFinding()).toBeUndefined()
  })

  it('goes quiet when voice EXEMPLARS exist, even with blank fields', async() => {
    // Exemplars are the stronger voice definition — a writer who supplied
    // prose to match is not nagged about the form fields.
    write('bible/style.md', STYLE_TEMPLATE)
    write('bible/voice/opening.md', 'The tide went out and took the light with it.\n')
    expect(await styleFinding()).toBeUndefined()
  })

  it('stays silent on projects with no style page at all', async() => {
    expect(await styleFinding()).toBeUndefined()
  })
})

describe('onboarding asks the writer for voice exemplars', () => {
  it('the supervisor playbook requests real prose and forbids inventing it', async() => {
    const model = new ScriptedModel()
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orchestrator.setMode('auto')
    await orchestrator
      .buildGraph()
      .invoke(
        { messages: [new HumanMessage('hi')] },
        { configurable: { thread_id: 'voice-onboard' }, recursionLimit: 12 }
      )

    const system = String(model.calls[0][0].content)
    expect(system).toContain('VOICE EXEMPLARS')
    expect(system).toContain('bible/voice/')
    // THE critical rule: a model-written exemplar teaches the model its own
    // voice, which would re-create the very bug this fixes.
    expect(system).toMatch(/NEVER write exemplars yourself/)
    // Asked once, not nagged.
    expect(system).toMatch(/never nag again/)
  })
})
