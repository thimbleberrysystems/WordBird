/**
 * Decisions log — settled creative choices that agents never relitigate.
 * Deliberately a NORMAL project file (bible/decisions.md) so every file
 * mechanism applies: writer edits + freshness + vantage + review-gated
 * amendments + snapshots. These specs lock the parser, the two tools,
 * the brief section, the lock respect, and the prompt doctrine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  DECISIONS_FILE,
  appendDecision,
  formatDecision,
  listDecisions,
  parseDecisions
} from '../../../src/main/services/novel/Decisions'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import {
  AgentToolService,
  AgentToolPackLoader
} from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import {
  SUPERVISOR_TOOL_NAMES,
  SUPERVISOR_WRITE_TOOL_NAMES,
  buildSupervisorPrompt
} from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { AGENT_ROLES, PROJECT_CONVENTIONS } from '../../../src/main/services/ai/orchestrator/roles'
import { mainThreadToolNames } from '../../../src/main/services/ai/agentSdk/toolBridge'

const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

let root: string

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-decisions-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'D', flavor: 'chapters-scenes' }))
  fs.mkdirSync(path.join(root, 'manuscript'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('Decisions parse/append', () => {
  it('append creates the file with a writer-facing header and parses back', () => {
    const entry = appendDecision(root, 'The sister stays dead', 'the grief must be permanent')
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const content = fs.readFileSync(path.join(root, DECISIONS_FILE), 'utf8')
    expect(content).toContain('# Decisions')
    expect(content).toContain('this file is yours')
    expect(content).toContain(formatDecision(entry))

    const parsed = listDecisions(root)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].decision).toBe('The sister stays dead')
    expect(parsed[0].reason).toBe('the grief must be permanent')
  })

  it('tolerates hand edits — prose lines are preserved, only entries parse', () => {
    appendDecision(root, 'No prologue')
    const target = path.join(root, DECISIONS_FILE)
    fs.appendFileSync(target, '\nSome free-form musing the writer typed.\n')
    appendDecision(root, 'Magic stays unexplained', 'mystery is the point')

    const entries = parseDecisions(fs.readFileSync(target, 'utf8'))
    expect(entries.map((e) => e.decision)).toEqual(['No prologue', 'Magic stays unexplained'])
    expect(fs.readFileSync(target, 'utf8')).toContain('free-form musing')
  })

  it('respects a writer lock like any bible page', () => {
    write(DECISIONS_FILE, '---\nlocked: true\n---\n# Decisions\n')
    expect(() => appendDecision(root, 'x')).toThrow(/LOCKED canon/)
  })
})

describe('decision tools over the real pack', () => {
  type Handler = (args: Record<string, unknown>, context: unknown) => Promise<unknown>
  let service: AgentToolService
  const run = (id: string, args: Record<string, unknown>): Promise<unknown> => {
    const handler = (
      service as unknown as { _handlers: Map<string, Handler> }
    )._handlers.get(id)
    if (!handler) throw new Error(`handler ${id} not registered`)
    return handler(args, { projectRoot: root })
  }

  beforeEach(async() => {
    service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
    const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
    service.loadToolPack(await loader.loadPack(TOOL_PACK))
    service.setProjectRoot(root)
  })

  it('record_decision appends and announces the settled status', async() => {
    const result = (await run('record_decision', {
      decision: 'The sister stays dead',
      reason: 'grief must be permanent'
    })) as { recorded: { decision: string }; total: number; note: string }
    expect(result.recorded.decision).toBe('The sister stays dead')
    expect(result.total).toBe(1)
    expect(result.note).toMatch(/settled/i)
  })

  it('list_decisions returns entries and coaches when empty', async() => {
    const empty = (await run('list_decisions', {})) as { decisions: unknown[]; note: string }
    expect(empty.decisions).toHaveLength(0)
    expect(empty.note).toMatch(/record_decision/)

    await run('record_decision', { decision: 'No prologue' })
    const result = (await run('list_decisions', {})) as {
      decisions: Array<{ decision: string }>
      note: string
    }
    expect(result.decisions[0].decision).toBe('No prologue')
    expect(result.note).toMatch(/Never propose against/i)
  })
})

describe('brief + mode gating + prompt doctrine', () => {
  it('the brief carries recent decisions and omits the section when none', async() => {
    const bare = await new ContextBuilder().buildProjectBrief(root)
    expect(bare).not.toContain('DECISIONS (settled')

    appendDecision(root, 'The sister stays dead', 'grief must be permanent')
    for (let i = 0; i < 9; i++) appendDecision(root, `Filler decision ${i}`)
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('DECISIONS (settled by the writer')
    expect(brief).toContain('Filler decision 8')
    expect(brief).toContain('…+2 earlier (list_decisions)') // 10 total, 8 shown
  })

  it('record is an execution-mode write; list is readable everywhere', async() => {
    expect(SUPERVISOR_WRITE_TOOL_NAMES).toContain('record_decision')
    expect(SUPERVISOR_TOOL_NAMES).toContain('list_decisions')
    expect(SUPERVISOR_TOOL_NAMES).not.toContain('record_decision')
    expect(AGENT_ROLES.auditor.allowedTools).toContain('record_decision')

    const service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
    const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
    service.loadToolPack(await loader.loadPack(TOOL_PACK))
    const askTools = mainThreadToolNames(service, 'ask')
    expect(askTools).toContain('list_decisions')
    expect(askTools).not.toContain('record_decision')
  })

  it('the supervisor doctrine forbids relitigating', () => {
    const prompt = buildSupervisorPrompt('approvals', 6)
    expect(prompt).toContain('DECISIONS ARE SETTLED')
    expect(prompt).toContain('record_decision it WITH the reason')
    expect(PROJECT_CONVENTIONS).toContain('bible/decisions.md')
    expect(PROJECT_CONVENTIONS).toContain('never relitigate')
  })
})
