/**
 * P0.2 — long-run autonomy: the book-run continuation loop, scene N→N+1
 * handoff, whole-book plan progress in the brief, checkpoint pruning, and
 * the auto-mode prompt contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { driveBookRun, CONTINUE_RE, type BookRunDeps } from '../../../src/main/services/ai/bookRun'
import { FileCheckpointSaver } from '../../../src/main/services/ai/FileCheckpointSaver'
import { ContextBuilder } from '../../../src/main/services/ai/ContextBuilder'
import { Orchestrator } from '../../../src/main/services/ai/orchestrator/Orchestrator'

describe('CONTINUE marker', () => {
  it('matches only a final CONTINUE line and captures the reason', () => {
    expect(CONTINUE_RE.exec('Done for now.\nCONTINUE: draft scene 3')?.[1]).toBe('draft scene 3')
    expect(CONTINUE_RE.exec('CONTINUE: solo line')?.[1]).toBe('solo line')
    expect(CONTINUE_RE.test('We could CONTINUE: later maybe\nBut not now.')).toBe(false)
    expect(CONTINUE_RE.test('No marker here.')).toBe(false)
  })

  it('tolerates markdown emphasis and trailing whitespace around the marker', () => {
    expect(CONTINUE_RE.exec('Scene 1 done.\n**CONTINUE: scene 2**')?.[1]).toBe('scene 2')
    expect(CONTINUE_RE.exec('Done.\nCONTINUE: scene 2\n\n')?.[1]).toBe('scene 2')
    expect(CONTINUE_RE.exec('Done.\n*CONTINUE: next*  ')?.[1]).toBe('next')
  })
})

describe('driveBookRun', () => {
  interface TestDeps extends BookRunDeps {
    invocations: number
    statuses: string[]
  }

  const deps = (overrides: Partial<BookRunDeps> = {}): TestDeps => {
    let progress = 0
    const d: TestDeps = {
      invocations: 0,
      statuses: [],
      invokeNext: async() => {
        d.invocations += 1
        return 'segment done\nCONTINUE: next scene'
      },
      isAuto: () => true,
      sessionTokens: () => 0,
      // Every segment makes progress by default.
      progressSignature: () => `sig-${progress++}`,
      emitStatus: (label: string) => {
        d.statuses.push(label)
      },
      maxContinuations: 3,
      tokenCeiling: 1_000_000,
      ...overrides
    }
    return d
  }

  it('returns untouched content when there is no marker', async() => {
    const d = deps()
    const result = await driveBookRun('All finished.', d)
    expect(result).toBe('All finished.')
    expect(d.invocations).toBe(0)
  })

  it('strips the marker without continuing outside auto mode', async() => {
    const d = deps({ isAuto: () => false })
    const result = await driveBookRun('Done.\nCONTINUE: more', d)
    expect(result).toBe('Done.')
    expect(d.invocations).toBe(0)
  })

  it('keeps granting segments until the ceiling, then pauses with a note', async() => {
    const d = deps({ maxContinuations: 3 })
    const result = await driveBookRun('start\nCONTINUE: scene 1', d)
    expect(d.invocations).toBe(3)
    expect(result).toContain('segment done')
    expect(result).not.toMatch(/(^|\n)CONTINUE:/)
    expect(result).toContain('safety ceiling')
    expect(d.statuses.length).toBe(3)
  })

  it('stops when the model omits the marker (plan complete)', async() => {
    const d = deps()
    d.invokeNext = async() => {
      d.invocations += 1
      return d.invocations < 2 ? 'more\nCONTINUE: keep going' : 'The novella is complete.'
    }
    const result = await driveBookRun('start\nCONTINUE: scene 1', d)
    expect(d.invocations).toBe(2)
    expect(result).toBe('The novella is complete.')
  })

  it('a ceiling asks the writer and RESUMES with a fresh block when approved', async() => {
    let asks = 0
    const d = deps({
      maxContinuations: 2,
      requestContinuation: async(reason: string) => {
        asks += 1
        expect(reason).toContain('segments')
        // Grant one extra block, then decline.
        return asks === 1
      }
    })
    d.invokeNext = async() => {
      d.invocations += 1
      // Finish cleanly during the granted block.
      return d.invocations < 4 ? 'more\nCONTINUE: next' : 'The novella is complete.'
    }
    const result = await driveBookRun('start\nCONTINUE: scene 1', d)
    expect(asks).toBe(1)
    expect(d.invocations).toBe(4)
    expect(result).toBe('The novella is complete.')
  })

  it('a declined ceiling pauses the run with the resume hint', async() => {
    const d = deps({
      maxContinuations: 2,
      requestContinuation: async() => false
    })
    const result = await driveBookRun('start\nCONTINUE: scene 1', d)
    expect(d.invocations).toBe(2)
    expect(result).toContain('safety ceiling')
    expect(result).toContain('continue')
  })

  it('the token ceiling also asks and extends on approval', async() => {
    let tokens = 0
    let asks = 0
    const d = deps({
      sessionTokens: () => {
        tokens += 600
        return tokens
      },
      tokenCeiling: 1000,
      maxContinuations: 10,
      requestContinuation: async(reason: string) => {
        asks += 1
        expect(reason.toLowerCase()).toContain('token')
        return asks <= 1
      }
    })
    const result = await driveBookRun('start\nCONTINUE: scene 1', d)
    expect(asks).toBeGreaterThanOrEqual(2)
    expect(result).toContain('token budget')
  })

  it('detects two stalled segments and pauses', async() => {
    const d = deps({ progressSignature: () => 'frozen', maxContinuations: 10 })
    const result = await driveBookRun('start\nCONTINUE: scene 1', d)
    expect(d.invocations).toBe(2)
    expect(result).toContain('no visible progress')
  })

  it('pauses on the token ceiling', async() => {
    let tokens = 0
    const d = deps({
      sessionTokens: () => {
        tokens += 600
        return tokens
      },
      tokenCeiling: 1000,
      maxContinuations: 10
    })
    const result = await driveBookRun('start\nCONTINUE: scene 1', d)
    expect(result).toContain('token budget')
  })

  it('stops with an error note on failure, but rethrows aborts', async() => {
    const failing = deps({
      invokeNext: async() => {
        throw new Error('model exploded')
      }
    })
    const result = await driveBookRun('start\nCONTINUE: x', failing)
    expect(result).toContain('Book run stopped on an error')
    expect(result).toContain('model exploded')

    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const aborting = deps({
      invokeNext: async() => {
        throw abortError
      }
    })
    await expect(driveBookRun('start\nCONTINUE: x', aborting)).rejects.toThrow('aborted')
  })
})

describe('FileCheckpointSaver pruning', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-prune-'))
    file = path.join(dir, 'checkpoints.json')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const buildGraph = (saver: FileCheckpointSaver) =>
    new StateGraph(MessagesAnnotation)
      .addNode('agent', async(state) => ({
        messages: [new AIMessage(`reply-${state.messages.length}`)]
      }))
      .addEdge('__start__', 'agent')
      .compile({ checkpointer: saver })

  it('keeps only the newest K checkpoints per thread and still resumes', async() => {
    const saver = new FileCheckpointSaver(file, 3)
    const graph = buildGraph(saver)
    const config = { configurable: { thread_id: 'long' } }
    for (let i = 0; i < 6; i++) {
      await graph.invoke({ messages: [new HumanMessage(`turn ${i}`)] }, config)
    }
    const storage = (saver as unknown as {
      storage: Record<string, Record<string, Record<string, unknown>>>
    }).storage
    for (const ns of Object.keys(storage.long)) {
      expect(Object.keys(storage.long[ns]).length).toBeLessThanOrEqual(3)
    }
    // The newest state is intact: the conversation keeps accumulating.
    const result = (await graph.invoke(
      { messages: [new HumanMessage('final')] },
      config
    )) as { messages: unknown[] }
    expect(result.messages.length).toBeGreaterThan(12)
  })
})

describe('scene handoff', () => {
  let root: string
  const builder = new ContextBuilder()

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-handoff-'))
    fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.wordbird', 'project.json'),
      JSON.stringify({ name: 'H', flavor: 'chapters-scenes' })
    )
    fs.mkdirSync(path.join(root, 'manuscript', 'chapter-one'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'manuscript', 'chapter-one', 'first.md'),
      'The lighthouse keeper counted the waves. The storm arrived at midnight.'
    )
    fs.writeFileSync(path.join(root, 'manuscript', 'chapter-one', 'second.md'), '')
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('gives a drafter the tail of the preceding scene', async() => {
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(root)
    const scenes = structure.units[0].children!
    const task = `Draft the storm scene <id:${scenes[1].id}> following the outline.`
    const handoff = await builder.buildSceneHandoff(root, task)
    expect(handoff).toBeTruthy()
    expect(handoff).toContain('PREVIOUS SCENE ENDS')
    expect(handoff).toContain('storm arrived at midnight')
    expect(handoff).toContain('do not retell')
  })

  it('returns null for the first scene and for tasks without a unit id', async() => {
    const { structureService } = await import('../../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(root)
    const scenes = structure.units[0].children!
    expect(await builder.buildSceneHandoff(root, `Draft <id:${scenes[0].id}>`)).toBeNull()
    expect(await builder.buildSceneHandoff(root, 'Draft something nice')).toBeNull()
    expect(await builder.buildSceneHandoff(null, 'Draft <id:x>')).toBeNull()
  })
})

describe('brief carries whole-book plan progress', () => {
  it('names the freshest incomplete plan with its item counts', async() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-plan-'))
    fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.wordbird', 'project.json'),
      JSON.stringify({ name: 'P', flavor: 'chapters-scenes' })
    )
    fs.mkdirSync(path.join(root, 'manuscript'), { recursive: true })
    fs.writeFileSync(path.join(root, 'manuscript', 'one.md'), 'Words.')
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'plans', 'novella.md'),
      '# Plan\n- [x] outline\n- [ ] scene 1\n- [ ] scene 2\n'
    )
    const brief = await new ContextBuilder().buildProjectBrief(root)
    expect(brief).toContain('ACTIVE PLAN')
    expect(brief).toContain('plans/novella.md')
    expect(brief).toContain('1/3 items done')
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('auto-mode prompt teaches the book-run protocol', () => {
  it('mentions CONTINUE and when to omit it', async() => {
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
    orchestrator.setMode('auto')
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: 'br1' }, recursionLimit: 12 }
    )
    const system = String(model.calls[0][0].content)
    expect(system).toContain('BOOK RUN')
    expect(system).toContain('CONTINUE:')
    expect(system).toContain('OMIT the marker')

    // Approvals mode must NOT teach auto-continuation.
    const model2 = { ...model, calls: [] as BaseMessage[][] }
    const orch2 = new Orchestrator({
      modelFactory: () => model2 as never,
      tools: [],
      callbacks: { emitActivity: () => {}, requestApproval: async() => true }
    })
    orch2.setMode('approvals')
    const graph2 = orch2.buildGraph() as unknown as {
      invoke: (s: unknown, o?: unknown) => Promise<unknown>
    }
    await graph2.invoke(
      { messages: [new HumanMessage('hi')] },
      { configurable: { thread_id: 'br2' }, recursionLimit: 12 }
    )
    expect(String(model2.calls[0][0].content)).not.toContain('BOOK RUN')
  })
})
