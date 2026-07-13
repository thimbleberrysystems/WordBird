/**
 * Agent history tools over the snapshot mini-git (list / read-at /
 * diff-against / gated restore) and the freshness signals (changed-since-
 * last-turn brief line, rewind events, list_files timestamps).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { snapshotService } from '../../../src/main/services/novel/SnapshotService'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-history-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'H', flavor: 'chapters-scenes' }))
  write('manuscript/chapter-one/opening.md', 'The first version of the scene.\n')
  service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('snapshot history tools', () => {
  it('list → read-at → diff round-trips a file through history', async() => {
    await snapshotService.snapshot(root, 'first draft')
    write('manuscript/chapter-one/opening.md', 'The REWRITTEN version of the scene.\n')
    await snapshotService.snapshot(root, 'rewrite')

    const listed = (await run('list_snapshots', {})) as {
      count: number
      snapshots: Array<{ id: string; message: string; at: string }>
    }
    expect(listed.count).toBeGreaterThanOrEqual(2)
    const first = listed.snapshots.find((s) => s.message === 'first draft')!
    expect(first.at).toMatch(/^\d{4}-/)

    const old = (await run('read_snapshot_file', {
      snapshotId: first.id,
      path: 'manuscript/chapter-one/opening.md'
    })) as { found: boolean; content: string }
    expect(old.found).toBe(true)
    expect(old.content).toContain('first version')

    const diff = (await run('diff_snapshot_file', {
      snapshotId: first.id,
      path: 'manuscript/chapter-one/opening.md'
    })) as { identical: boolean; diff: string }
    expect(diff.identical).toBe(false)
    expect(diff.diff).toContain('-The first version')
    expect(diff.diff).toContain('+The REWRITTEN version')
  })

  it('reports missing files honestly and identical files cheaply', async() => {
    await snapshotService.snapshot(root, 'baseline')
    const listed = (await run('list_snapshots', {})) as {
      snapshots: Array<{ id: string; message: string }>
    }
    const baseline = listed.snapshots.find((s) => s.message === 'baseline')!

    const missing = (await run('read_snapshot_file', {
      snapshotId: baseline.id,
      path: 'manuscript/never-existed.md'
    })) as { found: boolean; note: string }
    expect(missing.found).toBe(false)
    expect(missing.note).toContain('list_snapshots')

    const same = (await run('diff_snapshot_file', {
      snapshotId: baseline.id,
      path: 'manuscript/chapter-one/opening.md'
    })) as { identical: boolean }
    expect(same.identical).toBe(true)
  })

  it('preview_snapshot reports revert/delete/resurrect WITHOUT touching files', async() => {
    write('manuscript/chapter-one/doomed.md', 'This file will be deleted after the snapshot.\n')
    await snapshotService.snapshot(root, 'baseline')
    const baseline = (await snapshotService.list(root)).find((s) => s.message === 'baseline')!

    // After the snapshot: modify one file, add one, delete one.
    write('manuscript/chapter-one/opening.md', 'The MODIFIED version.\n')
    write('manuscript/chapter-one/brand-new.md', 'Written after the snapshot.\n')
    fs.rmSync(path.join(root, 'manuscript/chapter-one/doomed.md'))

    const preview = (await run('preview_snapshot', { snapshotId: baseline.id })) as {
      identicalToNow: boolean
      wouldRevert: { items: string[] }
      wouldDelete: { items: string[] }
      wouldResurrect: { items: string[] }
      note: string
    }
    expect(preview.identicalToNow).toBe(false)
    expect(preview.wouldRevert.items).toContain('manuscript/chapter-one/opening.md')
    expect(preview.wouldDelete.items).toContain('manuscript/chapter-one/brand-new.md')
    expect(preview.wouldResurrect.items).toContain('manuscript/chapter-one/doomed.md')
    expect(preview.note).toContain('nothing was changed')

    // Preview must not have touched the working tree.
    expect(
      fs.readFileSync(path.join(root, 'manuscript/chapter-one/opening.md'), 'utf8')
    ).toContain('MODIFIED')
    expect(fs.existsSync(path.join(root, 'manuscript/chapter-one/brand-new.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'manuscript/chapter-one/doomed.md'))).toBe(false)
  })

  it('preview of an identical snapshot says so', async() => {
    await snapshotService.snapshot(root, 'clean')
    const clean = (await snapshotService.list(root)).find((s) => s.message === 'clean')!
    const preview = (await run('preview_snapshot', { snapshotId: clean.id })) as {
      identicalToNow: boolean
    }
    expect(preview.identicalToNow).toBe(true)
  })

  it('restore_snapshot rewinds the working tree (service level)', async() => {
    await snapshotService.snapshot(root, 'good state')
    const good = (await snapshotService.list(root)).find((s) => s.message === 'good state')!
    write('manuscript/chapter-one/opening.md', 'Ruined.\n')
    await snapshotService.snapshot(root, 'bad state')

    const result = (await run('restore_snapshot', { snapshotId: good.id })) as {
      restored: boolean
      note: string
    }
    expect(result.restored).toBe(true)
    expect(result.note).toContain('safety snapshot')
    expect(
      fs.readFileSync(path.join(root, 'manuscript/chapter-one/opening.md'), 'utf8')
    ).toContain('first version')
  })

  it('restore_snapshot is destructive-gated: a decline blocks execution', async() => {
    await snapshotService.snapshot(root, 'good state')
    const good = (await snapshotService.list(root)).find((s) => s.message === 'good state')!
    write('manuscript/chapter-one/opening.md', 'Current text stays.\n')

    const model = {
      step: 0,
      bindTools() {
        return this
      },
      async invoke(): Promise<AIMessage> {
        this.step += 1
        if (this.step === 1) {
          return new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'call-restore',
                name: 'restore_snapshot',
                args: { snapshotId: good.id }
              }
            ]
          })
        }
        return new AIMessage('ok, not restoring')
      }
    }
    service.setProjectRoot(root)
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: service.getLangChainTools(),
      callbacks: {
        emitActivity: () => {},
        // The writer DECLINES the rewind.
        requestApproval: async() => false
      }
    })
    orchestrator.setMode('auto')
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph.invoke(
      { messages: [new HumanMessage('rewind everything')] },
      { configurable: { thread_id: 'restore-gate' }, recursionLimit: 12 }
    )
    // Declined → the file was never rewound.
    expect(
      fs.readFileSync(path.join(root, 'manuscript/chapter-one/opening.md'), 'utf8')
    ).toContain('Current text stays')
  })
})

describe('freshness signals', () => {
  it('the brief lists files changed since the previous brief (fallback path)', async() => {
    const builder = new ContextBuilder()
    const first = await builder.buildProjectBrief(root)
    expect(first).not.toContain('CHANGED SINCE YOUR LAST TURN')

    await new Promise((resolve) => setTimeout(resolve, 15))
    write('manuscript/chapter-one/opening.md', 'The writer edited this by hand.\n')
    const second = await builder.buildProjectBrief(root)
    expect(second).toContain('CHANGED SINCE YOUR LAST TURN')
    expect(second).toContain('opening.md')

    // Steady state: nothing changed → no stale warning.
    const third = await builder.buildProjectBrief(root)
    expect(third).not.toContain('CHANGED SINCE YOUR LAST TURN')
  })

  it('turn-scoped: the SAME warning reaches every brief build of the turn', async() => {
    const builder = new ContextBuilder()
    // Turn 1 establishes the window.
    builder.beginTurn(root)
    await builder.buildProjectBrief(root)
    builder.endTurn(root)

    // Writer edits between turns.
    await new Promise((resolve) => setTimeout(resolve, 15))
    write('manuscript/chapter-one/opening.md', 'Writer hand edit between turns.\n')

    // Turn 2: supervisor iteration AND a worker both see the warning.
    builder.beginTurn(root)
    const supervisorBrief = await builder.buildProjectBrief(root)
    const workerBrief = await builder.buildProjectBrief(root)
    expect(supervisorBrief).toContain('CHANGED SINCE YOUR LAST TURN')
    expect(supervisorBrief).toContain('opening.md')
    expect(workerBrief).toContain('CHANGED SINCE YOUR LAST TURN')
    expect(workerBrief).toContain('opening.md')
    builder.endTurn(root)
  })

  it("turn-scoped: the agent's own mid-turn edits are NOT flagged next turn", async() => {
    const builder = new ContextBuilder()
    builder.beginTurn(root)
    await builder.buildProjectBrief(root)
    // The agent itself writes a file DURING the turn.
    write('manuscript/chapter-one/agent-authored.md', 'Drafted by an agent mid-turn.\n')
    builder.endTurn(root)

    builder.beginTurn(root)
    const nextTurn = await builder.buildProjectBrief(root)
    expect(nextTurn).not.toContain('CHANGED SINCE YOUR LAST TURN')
    builder.endTurn(root)
  })

  it('turn-scoped: rewind events persist across every build of the turn', async() => {
    const builder = new ContextBuilder()
    builder.beginTurn(root)
    builder.endTurn(root)
    builder.recordProjectEvent(root, 'The writer REWOUND the project to snapshot abc12345.')

    builder.beginTurn(root)
    const first = await builder.buildProjectBrief(root)
    const second = await builder.buildProjectBrief(root)
    expect(first).toContain('REWOUND')
    expect(second).toContain('REWOUND')
    builder.endTurn(root)

    // Consumed with the turn — the following turn is quiet.
    builder.beginTurn(root)
    const after = await builder.buildProjectBrief(root)
    expect(after).not.toContain('PROJECT EVENTS')
    builder.endTurn(root)
  })

  it('rewind events surface once in the next brief (fallback path)', async() => {
    const builder = new ContextBuilder()
    await builder.buildProjectBrief(root)
    builder.recordProjectEvent(root, 'The writer REWOUND the project to snapshot abc12345.')
    const brief = await builder.buildProjectBrief(root)
    expect(brief).toContain('PROJECT EVENTS SINCE YOUR LAST TURN')
    expect(brief).toContain('REWOUND')
    const after = await builder.buildProjectBrief(root)
    expect(after).not.toContain('PROJECT EVENTS')
  })

  it('list_files reports modification timestamps', async() => {
    const listed = (await run('list_files', {})) as {
      files: Array<{ path: string; modifiedAt?: string }>
    }
    const opening = listed.files.find((f) => f.path.includes('opening.md'))!
    expect(opening.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('the prompt teaches history + freshness discipline', async() => {
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
    const orchestrator = new Orchestrator({
      modelFactory: () => model as never,
      tools: [],
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orchestrator.setMode('approvals')
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: 'hist1' }, recursionLimit: 12 }
    )
    const system = String(model.calls[0][0].content)
    expect(system).toContain('HISTORY IS A TOOL')
    expect(system).toContain('diff_snapshot_file')
    expect(system).toContain('FRESHNESS')
    expect(system).toContain('CHANGED SINCE YOUR LAST TURN')
    expect(system).toContain('restore_snapshot')
    // Preview-before-restore is a hard rule.
    expect(system).toContain('ALWAYS preview_snapshot first')
  })
})
