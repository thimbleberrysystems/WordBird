/**
 * Tool-safety contract, born from the holistic audit (F0–F8): the same
 * law at every layer — .wordbird/.git untouchable, locked canon immutable,
 * containment judged on real paths, the apply gate writes ONLY pending
 * proposals, and destructive tools are writer-gated in BOTH providers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  assertNotInternalPath,
  assertRealInside,
  assertNotLockedCanon,
  isLockedCanon,
  validateAgentApply
} from '../../../src/main/services/ai/pathGuards'
import {
  AgentToolService,
  AgentToolPackLoader
} from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { EditResolutionTracker } from '../../../src/main/services/ai/EditResolutionTracker'
import {
  DESTRUCTIVE_TOOLS,
  SUPERVISOR_TOOL_NAMES,
  SUPERVISOR_WRITE_TOOL_NAMES,
  buildSupervisorPrompt
} from '../../../src/main/services/ai/orchestrator/Orchestrator'
import {
  buildSdkAgents,
  mainThreadToolNames,
  stripMcpPrefix
} from '../../../src/main/services/ai/agentSdk/toolBridge'

const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

// ---- Fixture project ---------------------------------------------------------

let root: string
let service: AgentToolService

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

type Handler = (args: Record<string, unknown>, context: unknown) => Promise<unknown>
const run = (id: string, args: Record<string, unknown>): Promise<unknown> => {
  const handler = (
    service as unknown as { _handlers: Map<string, Handler> }
  )._handlers.get(id)
  if (!handler) throw new Error(`handler ${id} not registered`)
  return handler(args, { projectRoot: root })
}

beforeEach(async() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-safety-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'S', flavor: 'chapters-scenes' }))
  write('.wordbird/structure.json', '{"units": []}')
  write('manuscript/chapter-one/opening.md', 'The keeper waited on the jetty.\n')
  write('bible/characters/zara.md', '---\nlocked: true\naliases: [Zara]\n---\n\n# Zara\nEyes: grey.\n')
  write('bible/characters/finn.md', '---\naliases: [Finn]\n---\n\n# Finn\nEyes: brown.\n')
  fs.mkdirSync(path.join(root, '.git'), { recursive: true })
  fs.writeFileSync(path.join(root, '.git/config'), '[core]\n')

  service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
  const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
  service.loadToolPack(await loader.loadPack(TOOL_PACK))
  service.setProjectRoot(root)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

// ---- pathGuards primitives ------------------------------------------------------

describe('pathGuards', () => {
  it('refuses internal top-level directories', () => {
    expect(() => assertNotInternalPath(root, path.join(root, '.wordbird/structure.json')))
      .toThrow(/off limits/)
    expect(() => assertNotInternalPath(root, path.join(root, '.git/config')))
      .toThrow(/off limits/)
    expect(assertNotInternalPath(root, path.join(root, 'manuscript/a.md')))
      .toBe(path.join('manuscript', 'a.md'))
  })

  it('judges containment on REAL paths — symlinks cannot escape', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-outside-'))
    fs.writeFileSync(path.join(outside, 'secret.md'), 'outside content')
    fs.symlinkSync(outside, path.join(root, 'notes-link'))
    try {
      expect(() => assertRealInside(root, path.join(root, 'notes-link/secret.md')))
        .toThrow(/escape/i)
      // Ordinary paths (existing and to-be-created) stay fine.
      expect(() => assertRealInside(root, path.join(root, 'manuscript/chapter-one/opening.md')))
        .not.toThrow()
      expect(() => assertRealInside(root, path.join(root, 'manuscript/new-scene.md')))
        .not.toThrow()
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('detects locked canon and enforces it', () => {
    expect(isLockedCanon('---\nlocked: true\n---\nbody')).toBe(true)
    expect(isLockedCanon('---\naliases: [x]\n---\nbody')).toBe(false)
    expect(() => assertNotLockedCanon(path.join(root, 'bible/characters/zara.md')))
      .toThrow(/LOCKED canon/)
    expect(() => assertNotLockedCanon(path.join(root, 'bible/characters/finn.md')))
      .not.toThrow()
    expect(() => assertNotLockedCanon(path.join(root, 'does-not-exist.md'))).not.toThrow()
  })
})

// ---- F1/F2/F6: the generic file tools obey the same law --------------------------

describe('generic file tools (read_project_file / propose_*)', () => {
  it('cannot read or edit .wordbird or .git', async() => {
    await expect(run('read_project_file', { fname: '.wordbird/structure.json' }))
      .rejects.toThrow(/off limits/)
    await expect(run('read_project_file', { fname: '.git/config' }))
      .rejects.toThrow(/off limits/)
    await expect(
      run('propose_project_file_edit', { fname: '.wordbird/structure.json', newdata: '{}' })
    ).rejects.toThrow(/off limits/)
    await expect(
      run('propose_text_edit', {
        fname: '.wordbird/structure.json',
        oldText: 'units',
        newText: 'x'
      })
    ).rejects.toThrow(/off limits/)
  })

  it('cannot escape the project laterally or via symlink', async() => {
    await expect(run('read_project_file', { fname: '../outside.md' }))
      .rejects.toThrow(/outside the active WordBird project/)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-esc-'))
    fs.writeFileSync(path.join(outside, 'leak.md'), 'secret')
    fs.symlinkSync(outside, path.join(root, 'research'))
    try {
      await expect(run('read_project_file', { fname: 'research/leak.md' }))
        .rejects.toThrow(/escape/i)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('locked bible pages are immutable through EVERY edit route', async() => {
    await expect(
      run('propose_text_edit', {
        fname: 'bible/characters/zara.md',
        oldText: 'Eyes: grey.',
        newText: 'Eyes: blue.'
      })
    ).rejects.toThrow(/LOCKED canon/)
    await expect(
      run('propose_project_file_edit', {
        fname: 'bible/characters/zara.md',
        newdata: 'rewritten'
      })
    ).rejects.toThrow(/LOCKED canon/)

    // Unlocked pages remain editable — the lock is a lock, not a ban.
    const ok = (await run('propose_text_edit', {
      fname: 'bible/characters/finn.md',
      oldText: 'Eyes: brown.',
      newText: 'Eyes: hazel.'
    })) as { edit: { newContent: string } }
    expect(ok.edit.newContent).toContain('hazel')
  })

  it('read results carry no absolute host paths', async() => {
    const result = (await run('read_project_file', {
      fname: 'manuscript/chapter-one/opening.md'
    })) as Record<string, unknown>
    expect(result.path).toBe(path.join('manuscript', 'chapter-one', 'opening.md'))
    expect(result).not.toHaveProperty('filePath')
    expect(result).not.toHaveProperty('projectRoot')
  })
})

// ---- F0: the apply gate ------------------------------------------------------------

describe('apply gate (validateAgentApply + tracker lookup)', () => {
  it('accepts a legit manuscript proposal', () => {
    const target = validateAgentApply({
      originalPath: path.join(root, 'manuscript/chapter-one/opening.md'),
      recordedRoot: root,
      activeRoot: root
    })
    expect(target).toBe(path.join(root, 'manuscript/chapter-one/opening.md'))
  })

  it('refuses internals, locked canon, wrong extensions, and root mismatches', () => {
    expect(() =>
      validateAgentApply({
        originalPath: path.join(root, '.wordbird/structure.json'),
        recordedRoot: root,
        activeRoot: root
      })
    ).toThrow(/off limits|only write/)
    expect(() =>
      validateAgentApply({
        originalPath: path.join(root, 'bible/characters/zara.md'),
        recordedRoot: root,
        activeRoot: root
      })
    ).toThrow(/LOCKED canon/)
    expect(() =>
      validateAgentApply({
        originalPath: path.join(root, 'script.sh'),
        recordedRoot: root,
        activeRoot: root
      })
    ).toThrow(/only write/)
    expect(() =>
      validateAgentApply({
        originalPath: path.join(root, 'manuscript/a.md'),
        recordedRoot: '/somewhere/else',
        activeRoot: root
      })
    ).toThrow(/different project/)
    expect(() =>
      validateAgentApply({
        originalPath: '/tmp/evil.md',
        recordedRoot: root,
        activeRoot: root
      })
    ).toThrow(/escape|outside/i)
    expect(() =>
      validateAgentApply({ originalPath: 'a.md', recordedRoot: null, activeRoot: null })
    ).toThrow(/no project scope/)
  })

  it('tracker: proposals round-trip by id with their recorded root', () => {
    const dir = path.join(root, '.wordbird/agent-state')
    const tracker = new EditResolutionTracker(() => dir)
    const payload = {
      edit: { id: 'e-1', filePath: 'manuscript/a.md', newContent: 'new' },
      oldContent: 'old',
      originalPath: path.join(root, 'manuscript/a.md')
    }
    tracker.recordProposal(payload as never, 't-1', root)
    const pending = tracker.getPending('e-1')
    expect(pending?.projectRoot).toBe(root)
    expect(pending?.payload.edit.newContent).toBe('new')
    expect(tracker.getPending('nope')).toBeNull()
    // Settled proposals cannot be re-applied.
    tracker.resolve({ id: 'e-1', filePath: 'manuscript/a.md', accepted: true } as never)
    expect(tracker.getPending('e-1')).toBeNull()
  })
})

// ---- F8: SDK subagents cannot pre-approve destruction --------------------------------

describe('SDK subagent definitions', () => {
  it('carry no destructive tools in any mode (canUseTool must gate them)', () => {
    for (const mode of ['approvals', 'auto', 'ask'] as const) {
      for (const [roleName, agent] of Object.entries(buildSdkAgents(mode))) {
        for (const toolName of agent.tools) {
          expect(
            DESTRUCTIVE_TOOLS.includes(stripMcpPrefix(toolName)),
            `${mode}/${roleName} pre-approves ${toolName}`
          ).toBe(false)
        }
      }
    }
    // The filter removes ONLY destruction — drafters keep their edit tools.
    expect(buildSdkAgents('auto').drafter.tools.some((t) => t.endsWith('propose_text_edit')))
      .toBe(true)
  })
})

// ---- F3/F5: lists match doctrine ------------------------------------------------------

describe('supervisor tool lists', () => {
  it('revision lifecycle + snapshot are execution-mode tools, not ask-mode', () => {
    for (const name of ['start_revision', 'complete_revision', 'snapshot_project']) {
      expect(SUPERVISOR_WRITE_TOOL_NAMES).toContain(name)
      expect(SUPERVISOR_TOOL_NAMES).not.toContain(name)
    }
    expect(SUPERVISOR_TOOL_NAMES).toContain('get_revision')

    const askTools = mainThreadToolNames(service, 'ask')
    for (const name of ['start_revision', 'complete_revision', 'snapshot_project']) {
      expect(askTools, `${name} leaked into ask mode`).not.toContain(name)
    }
  })

  it('the snapshot doctrine is now something the supervisor can actually do', () => {
    expect(buildSupervisorPrompt('approvals', 6)).toContain('take snapshot_project yourself')
  })

  it('the next-step nudge is bounded: young projects only, never in book runs', () => {
    const prompt = buildSupervisorPrompt('approvals', 6)
    expect(prompt).toContain('NEXT-STEP NUDGE')
    expect(prompt).toContain('"Next: <one concrete suggestion>"')
    expect(prompt).toContain('NEVER during book-run segments')
  })
})

// ---- F4: confirm metadata is honest ----------------------------------------------------

describe('agentTools.json confirm field', () => {
  it("'renderer' exactly on tools whose result surfaces a renderer card", () => {
    const CARD_TOOLS = new Set([
      'propose_project_file_edit',
      'propose_text_edit',
      'propose_new_unit',
      'propose_new_file',
      'propose_bible_update',
      'propose_plan',
      'ask_writer'
    ])
    const pack = JSON.parse(fs.readFileSync(TOOL_PACK, 'utf8')) as {
      tools: Array<{ id: string; confirm: string }>
    }
    for (const tool of pack.tools) {
      const expected = CARD_TOOLS.has(tool.id) ? 'renderer' : 'never'
      expect(`${tool.id}:${tool.confirm}`).toBe(`${tool.id}:${expected}`)
    }
  })
})
