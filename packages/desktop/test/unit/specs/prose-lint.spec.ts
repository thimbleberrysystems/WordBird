/**
 * Borrowed-from-coding-agents verification layer: the deterministic prose
 * linter (proselint/Vale-style), the anchored propose_text_edit (Aider
 * SEARCH/REPLACE pattern), biscuit.md standing instructions (CLAUDE.md
 * pattern), and the prompt contracts that wire them in.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { lintProse, parseBannedTerms } from '../../../src/main/services/novel/ProseLint'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { AGENT_ROLES } from '../../../src/main/services/ai/orchestrator/roles'

describe('lintProse checks', () => {
  it('flags doubled words and close repetitions', () => {
    const { findings } = lintProse(
      'The keeper walked to the the lighthouse. The lighthouse door creaked as the lighthouse light spun.'
    )
    expect(findings.some((f) => f.type === 'doubled-word' && f.message.includes('the'))).toBe(true)
    expect(findings.some((f) => f.type === 'near-repeat' && f.message.includes('lighthouse'))).toBe(true)
  })

  it('flags filler words and POV filter phrases', () => {
    const { findings } = lintProse(
      'She was very tired and very cold, and it was very dark. ' +
      'She felt the wind rise. She felt the boards shift. She heard a knock.'
    )
    expect(findings.some((f) => f.type === 'filler-word' && f.message.includes('very'))).toBe(true)
    expect(findings.some((f) => f.type === 'filter-phrase' && f.message.includes('she felt'))).toBe(true)
  })

  it('reports sentence stats and hygiene problems', () => {
    const text = 'A short line.  Another "line here.\n'
    const { stats, findings } = lintProse(text)
    expect(stats.sentences).toBeGreaterThanOrEqual(2)
    expect(findings.some((f) => f.type === 'double-space')).toBe(true)
    expect(findings.some((f) => f.type === 'unbalanced-quotes')).toBe(true)
  })

  it('flags banned terms case-insensitively with counts', () => {
    const { findings } = lintProse('It was an orb of light. The ORB pulsed.', {
      bannedTerms: ['orb']
    })
    const banned = findings.find((f) => f.type === 'banned-term')
    expect(banned).toBeTruthy()
    expect(banned!.count).toBe(2)
  })

  it('clean prose produces few findings', () => {
    const { findings } = lintProse(
      'Rain fell across the harbor. Marguerite counted seven bells before dawn, ' +
      'each one duller than the last. Nobody answered her final knock.'
    )
    expect(findings.filter((f) => f.type !== 'filler-word')).toHaveLength(0)
  })
})

describe('parseBannedTerms (bible/style.md)', () => {
  it('reads bullet lists under a Banned/Avoid heading and inline avoid: lines', () => {
    const style = [
      '# Style',
      'Voice notes here.',
      '',
      '## Banned words',
      '- orb',
      '- "very"',
      '',
      '## Rhythm',
      '- long sentences are fine',
      '',
      'avoid: suddenly, somehow'
    ].join('\n')
    const terms = parseBannedTerms(style)
    expect(terms).toContain('orb')
    expect(terms).toContain('very')
    expect(terms).toContain('suddenly')
    expect(terms).toContain('somehow')
    // Items outside the banned section are NOT banned.
    expect(terms).not.toContain('long sentences are fine')
  })

  it('tolerates pages with no banned section', () => {
    expect(parseBannedTerms('# Style\nJust voice notes.')).toEqual([])
  })
})

describe('tools over a real project', () => {
  let root: string
  let service: AgentToolService

  const write = (relative: string, content: string): void => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }

  const run = async(handlerId: string, args: Record<string, unknown>): Promise<unknown> => {
    const handler = (
      service as unknown as {
        _handlers: Map<string, (a: Record<string, unknown>, c: unknown) => Promise<unknown>>
      }
    )._handlers.get(handlerId)
    if (!handler) throw new Error(`handler ${handlerId} not registered`)
    return handler(args, { projectRoot: root })
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-lint-'))
    write('.wordbird/project.json', JSON.stringify({ name: 'L', flavor: 'chapters-scenes' }))
    write(
      'manuscript/chapter-one/opening.md',
      'The keeper counted waves. The keeper counted bells. She felt very very tired.\n'
    )
    write('bible/style.md', '# Style\n\n## Avoid\n- keeper\n')
    service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('lint_prose works by unitId and folds in style.md banned terms', async() => {
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(root)
    const scene = structure.units[0].children![0]
    const result = (await run('lint_prose', { unitId: scene.id })) as {
      stats: { words: number }
      findings: Array<{ type: string }>
      note: string
    }
    expect(result.stats.words).toBeGreaterThan(5)
    expect(result.findings.some((f) => f.type === 'banned-term')).toBe(true)
    expect(result.findings.some((f) => f.type === 'doubled-word')).toBe(true)
    expect(result.note).toContain('not laws')
  })

  it('lint_prose requires exactly one of unitId/fname', async() => {
    await expect(run('lint_prose', {})).rejects.toThrow(/exactly one/)
  })

  it('propose_text_edit makes a surgical edit through the standard proposal payload', async() => {
    const result = (await run('propose_text_edit', {
      fname: 'manuscript/chapter-one/opening.md',
      oldText: 'counted waves',
      newText: 'counted the breakers',
      reason: 'stronger image'
    })) as {
      edit: { id: string; filePath: string; newContent: string; reason?: string }
      oldContent: string
      originalPath: string
    }
    expect(result.edit.newContent).toContain('counted the breakers')
    expect(result.edit.newContent).toContain('counted bells') // rest untouched
    expect(result.oldContent).toContain('counted waves')
    expect(result.edit.filePath).toBe('manuscript/chapter-one/opening.md')
  })

  it('propose_text_edit errors helpfully on no match and on ambiguity', async() => {
    await expect(
      run('propose_text_edit', {
        fname: 'manuscript/chapter-one/opening.md',
        oldText: 'counted waives',
        newText: 'x'
      })
    ).rejects.toThrow(/not found.*EXACTLY/is)

    await expect(
      run('propose_text_edit', {
        fname: 'manuscript/chapter-one/opening.md',
        oldText: 'The keeper counted',
        newText: 'She counted'
      })
    ).rejects.toThrow(/matches 2 places/)

    // occurrence resolves the ambiguity.
    const second = (await run('propose_text_edit', {
      fname: 'manuscript/chapter-one/opening.md',
      oldText: 'The keeper counted',
      newText: 'She counted',
      occurrence: 2
    })) as { edit: { newContent: string } }
    expect(second.edit.newContent).toContain('The keeper counted waves')
    expect(second.edit.newContent).toContain('She counted bells')
  })

  it('biscuit.md standing instructions ride the brief, capped', async() => {
    write('biscuit.md', 'Always use British spelling. Never kill the dog.')
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain("WRITER'S STANDING INSTRUCTIONS")
    expect(brief).toContain('Never kill the dog')

    write('biscuit.md', 'x'.repeat(5000))
    const capped = await new ContextBuilder().buildProjectBrief(root)
    expect(capped).toContain('…[trimmed]')
  })
})

describe('prompt contracts', () => {
  it('teaches surgical edits, lint discipline, and biscuit.md', async() => {
    const model = {
      calls: [] as BaseMessage[][],
      bindTools() {
        return this
      },
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        this.calls.push(messages)
        return new AIMessage('ok')
      }
    }
    const build = async(mode: 'auto' | 'approvals'): Promise<string> => {
      const orchestrator = new Orchestrator({
        modelFactory: () => model as never,
        tools: [],
        callbacks: { emitActivity: () => {}, requestApproval: async() => true }
      })
      orchestrator.setMode(mode)
      const graph = orchestrator.buildGraph() as unknown as {
        invoke: (s: unknown, o?: unknown) => Promise<unknown>
      }
      await graph.invoke(
        { messages: [new HumanMessage('hi')] },
        { configurable: { thread_id: `lintpin-${mode}` }, recursionLimit: 12 }
      )
      return String(model.calls[model.calls.length - 1][0].content)
    }

    const approvals = await build('approvals')
    expect(approvals).toContain('SURGICAL EDITS use propose_text_edit')
    expect(approvals).toContain('never guess line')
    expect(approvals).toContain('biscuit.md')

    const auto = await build('auto')
    expect(auto).toContain('lint_prose on each drafted scene')

    expect(AGENT_ROLES['line-editor'].systemPrompt).toContain('lint_prose')
    expect(AGENT_ROLES['line-editor'].allowedTools).toContain('propose_text_edit')
    expect(AGENT_ROLES.drafter.allowedTools).toContain('propose_text_edit')
    expect(AGENT_ROLES.auditor.allowedTools).toContain('lint_prose')
  })
})
