/**
 * Claude-subscription provider (claude-code): the Agent SDK runner and its
 * tool bridge, exercised with a scripted SDK module — no runtime, no
 * network. What must hold: the provider is wired into the constants, env
 * hygiene protects the subscription (no silent API-key billing), ask mode
 * stays mechanically read-only, destructive tools still require writer
 * approval, WordBird tools execute in-process through the SAME proposal
 * pipeline, and threads map to resumable SDK sessions.
 */

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  AI_PROVIDERS,
  CLAUDE_CODE_MODELS,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_LABELS,
  normalizeProvider
} from '../../../src/shared/constants/ai'
import { AgentSDKRunner } from '../../../src/main/services/ai/agentSdk/AgentSDKRunner'
import {
  MCP_TOOL_PREFIX,
  WRITE_TOOL_NAMES,
  buildSdkAgents,
  mainThreadToolNames,
  stripMcpPrefix
} from '../../../src/main/services/ai/agentSdk/toolBridge'
import { AgentToolService, AgentToolPackLoader } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { registerNovelAgentToolHandlers } from '../../../src/main/services/ai/NovelToolHandlers'
import { registerWebAgentToolHandlers } from '../../../src/main/services/ai/WebToolHandlers'
import type { OrchestratorCallbacks } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import type {
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IAgentStatus,
  ITokenUsageUpdate
} from '../../../src/shared/types/langgraph'

const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

// ---- Scripted SDK -----------------------------------------------------------

type SdkMessage = Record<string, unknown>

interface ScriptedSdk {
  tool: (...args: unknown[]) => unknown
  createSdkMcpServer: (options: { name: string; tools: unknown[] }) => unknown
  query: (params: { prompt: string; options?: Record<string, unknown> }) => AsyncGenerator<
    SdkMessage,
    void
  > & { interrupt?: () => Promise<unknown> }
  calls: Array<{ prompt: string; options: Record<string, unknown> }>
  registeredTools: Array<{ name: string; handler: (args: Record<string, unknown>) => Promise<unknown> }>
}

const makeSdk = (script: SdkMessage[]): ScriptedSdk => {
  const sdk: ScriptedSdk = {
    calls: [],
    registeredTools: [],
    tool: (name, _description, _schema, handler) => {
      sdk.registeredTools.push({
        name: String(name),
        handler: handler as (args: Record<string, unknown>) => Promise<unknown>
      })
      return { name }
    },
    createSdkMcpServer: (options) => ({ type: 'sdk', name: options.name, tools: options.tools }),
    query: ({ prompt, options }) => {
      sdk.calls.push({ prompt, options: options ?? {} })
      async function * gen(): AsyncGenerator<SdkMessage, void> {
        for (const message of script) yield message
      }
      const stream = gen() as ReturnType<ScriptedSdk['query']>
      stream.interrupt = async() => undefined
      return stream
    }
  }
  return sdk
}

const initMessage = (sessionId: string): SdkMessage => ({
  type: 'system',
  subtype: 'init',
  session_id: sessionId
})

const assistantToolUse = (
  name: string,
  input: Record<string, unknown>,
  id = `tu-${name}`
): SdkMessage => ({
  type: 'assistant',
  parent_tool_use_id: null,
  message: { content: [{ type: 'tool_use', id, name, input }] }
})

const userToolResult = (toolUseId: string, isError = false): SdkMessage => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError }] }
})

const successResult = (text: string, usage?: Record<string, number>): SdkMessage => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: text,
  usage: usage ?? { input_tokens: 1200, output_tokens: 300 }
})

// ---- Harness ----------------------------------------------------------------

interface Harness {
  runner: AgentSDKRunner
  sdk: ScriptedSdk
  activity: IAgentActivityEvent[]
  statuses: IAgentStatus[]
  approvals: IAgentApprovalRequest[]
  usage: ITokenUsageUpdate[]
  approveNext: { value: boolean }
  /** Queued mid-run steering notes; drained by the runner per invoke. */
  steering: string[]
  stateDir: string
  root: string
  service: AgentToolService
}

const makeHarness = async(script: SdkMessage[], apiKey = ''): Promise<Harness> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-sdk-'))
  fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.wordbird/project.json'),
    JSON.stringify({ name: 'S', flavor: 'chapters-scenes' })
  )
  fs.mkdirSync(path.join(root, 'manuscript/chapter-one'), { recursive: true })
  fs.writeFileSync(path.join(root, 'manuscript/chapter-one/opening.md'), 'The keeper waited.\n')

  const service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
  registerNovelAgentToolHandlers(service)
  registerWebAgentToolHandlers(service)
  const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
  service.loadToolPack(await loader.loadPack(TOOL_PACK))
  service.setProjectRoot(root)

  const activity: IAgentActivityEvent[] = []
  const statuses: IAgentStatus[] = []
  const approvals: IAgentApprovalRequest[] = []
  const usage: ITokenUsageUpdate[] = []
  const approveNext = { value: true }
  const steering: string[] = []
  const callbacks: OrchestratorCallbacks = {
    emitActivity: (event) => activity.push(event),
    requestApproval: async(request) => {
      approvals.push(request)
      return approveNext.value
    },
    buildBrief: async() => 'PROJECT BRIEF (test): one chapter, one scene.',
    emitAgentStatus: (status) => statuses.push(status),
    emitTokenUsage: (update) => usage.push(update),
    drainSteering: () => steering.splice(0)
  }

  const sdk = makeSdk(script)
  const stateDir = path.join(root, '.wordbird', 'agent-state')
  const runner = new AgentSDKRunner({
    config: { provider: 'claude-code', apiKey, model: 'sonnet' },
    callbacks,
    toolService: service,
    stateDir,
    projectRoot: () => root,
    sdkModule: sdk as never
  })
  return {
    runner,
    sdk,
    activity,
    statuses,
    approvals,
    usage,
    approveNext,
    steering,
    stateDir,
    root,
    service
  }
}

const cleanupRoots: string[] = []
afterEach(() => {
  for (const root of cleanupRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ---- Provider wiring ----------------------------------------------------------

describe('claude-code provider constants', () => {
  it('is a first-class provider with subscription-shaped defaults', () => {
    expect(AI_PROVIDERS).toContain('claude-code')
    expect(normalizeProvider('claude-code')).toBe('claude-code')
    expect(PROVIDER_LABELS['claude-code']).toMatch(/Claude subscription/i)
    expect(PROVIDER_DEFAULT_MODELS['claude-code']).toBe('sonnet')
    expect(CLAUDE_CODE_MODELS).toEqual(['sonnet', 'opus', 'haiku'])
  })
})

// ---- Env hygiene ----------------------------------------------------------------

describe('subscription env hygiene', () => {
  it('strips API credentials and wires the setup-token', async() => {
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)
    const runnerWithToken = new AgentSDKRunner({
      config: { provider: 'claude-code', apiKey: '  sk-ant-oat01-test  ', model: 'sonnet' },
      callbacks: { emitActivity: () => {}, requestApproval: async() => true },
      toolService: harness.service,
      stateDir: harness.stateDir
    })
    const env = runnerWithToken.buildEnv({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-api-SHOULD-NOT-LEAK',
      ANTHROPIC_AUTH_TOKEN: 'bearer-SHOULD-NOT-LEAK'
    } as NodeJS.ProcessEnv)
    // Either of these would silently bill API credits instead of the plan.
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat01-test')
    expect(env.PATH).toBe('/usr/bin')

    // No token pasted → fall through to the user's Claude Code login.
    const envNoToken = harness.runner.buildEnv({ PATH: '/usr/bin' } as NodeJS.ProcessEnv)
    expect(envNoToken.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
  })
})

// ---- Mode gating -----------------------------------------------------------------

describe('mode gating over the real tool pack', () => {
  it('ask mode strips every write tool; execution modes carry them', async() => {
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)

    const askTools = mainThreadToolNames(harness.service, 'ask')
    for (const writeTool of WRITE_TOOL_NAMES) {
      expect(askTools).not.toContain(writeTool)
    }
    expect(askTools).toContain('list_structure')
    expect(askTools).toContain('web_search')
    expect(askTools).toContain('propose_plan')

    const autoTools = mainThreadToolNames(harness.service, 'auto')
    expect(autoTools).toContain('propose_text_edit')
    expect(autoTools).toContain('delete_file')
  })

  it('ask mode spawns only read-only roles; execution modes map all six', () => {
    const askAgents = buildSdkAgents('ask')
    expect(Object.keys(askAgents).sort()).toEqual(['explorer', 'researcher'])
    for (const agent of Object.values(askAgents)) {
      for (const toolName of agent.tools) {
        expect(WRITE_TOOL_NAMES).not.toContain(stripMcpPrefix(toolName))
      }
    }

    const autoAgents = buildSdkAgents('auto')
    expect(Object.keys(autoAgents)).toHaveLength(7) // six specialists + the steward
    expect(autoAgents.drafter.tools).toContain(`${MCP_TOOL_PREFIX}propose_text_edit`)
  })
})

// ---- A full scripted turn -----------------------------------------------------------

describe('a scripted SDK turn', () => {
  it('maps the stream to WordBird events and returns the final text', async() => {
    const harness = await makeHarness([
      initMessage('sess-1'),
      assistantToolUse(`${MCP_TOOL_PREFIX}list_structure`, { flavor: 'all' }),
      assistantToolUse('Task', {
        subagent_type: 'drafter',
        description: 'Draft the cellar scene'
      }, 'tu-task-1'),
      userToolResult('tu-task-1'),
      successResult('Drafted and proposed the cellar scene.', {
        input_tokens: 2000,
        output_tokens: 500
      })
    ])
    cleanupRoots.push(harness.root)

    harness.runner.setMode('approvals')
    const graph = harness.runner.buildGraph()
    const response = await graph.invoke(
      { messages: [{ content: 'Draft the cellar scene please.' }] },
      { configurable: { thread_id: 't-main' } }
    )

    expect(response.messages[0].content).toBe('Drafted and proposed the cellar scene.')

    // Tool use → activity feed (bare name, not the MCP-prefixed one).
    const toolEvents = harness.activity.filter((e) => e.kind === 'tool')
    expect(toolEvents.some((e) => e.label === 'list_structure')).toBe(true)

    // Task spawn → agent tree rows: running, then done.
    expect(harness.activity.some((e) => e.kind === 'spawn')).toBe(true)
    expect(harness.statuses.map((s) => s.status)).toEqual(['running', 'done'])
    expect(harness.statuses[0].role).toBe('drafter')

    // Usage lands in the token counter.
    expect(harness.usage.length).toBeGreaterThan(0)
    expect(harness.usage[harness.usage.length - 1].turn.outputTokens).toBe(500)

    // The thread now maps to a resumable session…
    expect(harness.runner.hasThread('t-main')).toBe(true)
    const sessions = JSON.parse(
      fs.readFileSync(path.join(harness.stateDir, 'sdk-sessions.json'), 'utf8')
    )
    expect(sessions['t-main']).toBe('sess-1')

    // …and the next turn resumes it.
    await graph.invoke(
      { messages: [{ content: 'Continue.' }] },
      { configurable: { thread_id: 't-main' } }
    )
    expect(harness.sdk.calls[1].options.resume).toBe('sess-1')
  })

  it('binds only WordBird MCP tools + Task, never the file built-ins', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't' } }
    )

    const options = harness.sdk.calls[0].options
    const allowed = options.allowedTools as string[]
    // Task is deliberately OFF the allowlist: a bare entry would shadow
    // canUseTool, where duplicate spawns are bounced. It stays callable —
    // canUseTool allows non-duplicate spawns (pinned below).
    expect(allowed).not.toContain('Task')
    expect(allowed).toContain(`${MCP_TOOL_PREFIX}propose_text_edit`)
    expect(allowed.every((t) => t.startsWith(MCP_TOOL_PREFIX))).toBe(true)
    // Destructive tools must NOT be pre-approved: a bare allowedTools entry
    // shadows canUseTool, which would skip the writer-approval gate.
    for (const destructive of ['delete_unit', 'delete_file', 'restore_snapshot']) {
      expect(allowed).not.toContain(`${MCP_TOOL_PREFIX}${destructive}`)
    }
    const disallowed = options.disallowedTools as string[]
    for (const builtin of ['Bash', 'Read', 'Write', 'Edit', 'WebFetch']) {
      expect(disallowed).toContain(builtin)
    }
    // The user's personal CLAUDE.md/settings never leak into a novel session.
    expect(options.settingSources).toEqual([])
    // The brief and the Task-spawn doctrine ride the system prompt.
    expect(String(options.systemPrompt)).toContain('PROJECT BRIEF (test)')
    expect(String(options.systemPrompt)).toContain('Task')
  })

  it('destructive tools require writer approval through canUseTool', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't' } }
    )
    const canUseTool = harness.sdk.calls[0].options.canUseTool as (
      name: string,
      input: Record<string, unknown>
    ) => Promise<{ behavior: string; message?: string }>

    // Approved path.
    harness.approveNext.value = true
    const allowed = await canUseTool(`${MCP_TOOL_PREFIX}delete_file`, { fname: 'notes/x.md' })
    expect(allowed.behavior).toBe('allow')
    expect(harness.approvals).toHaveLength(1)
    expect(harness.approvals[0].summary).toMatch(/DESTRUCTIVE/i)

    // Declined path.
    harness.approveNext.value = false
    const denied = await canUseTool(`${MCP_TOOL_PREFIX}restore_snapshot`, { id: 'abc' })
    expect(denied.behavior).toBe('deny')

    // Ordinary supervisor reads never raise a card. (read_unit is now a
    // worker-lane tool on the main thread — parity with LangGraph — so the
    // representative read here is a supervisor tool.)
    const read = await canUseTool(`${MCP_TOOL_PREFIX}search_manuscript`, { query: 'x' })
    expect(read.behavior).toBe('allow')
    expect(harness.approvals).toHaveLength(2)
  })

  it('executes bridged tools in-process through the standard proposal pipeline', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)

    let proposal: { edit: { id: string; filePath: string } } | null = null
    harness.service.setEditProposalEmitter((payload) => {
      proposal = payload as never
    })

    // Trigger MCP registration (buildGraph → buildWordbirdMcpServer).
    harness.runner.setMode('approvals')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't' } }
    )

    const bridged = harness.sdk.registeredTools.find((t) => t.name === 'propose_text_edit')
    expect(bridged).toBeTruthy()
    const result = (await bridged!.handler({
      fname: 'manuscript/chapter-one/opening.md',
      oldText: 'The keeper waited.',
      newText: 'The keeper waited for the tide.'
    })) as { content: Array<{ text: string }>; isError?: boolean }

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toMatch(/Edit proposal created/i)
    expect(proposal).not.toBeNull()
    expect(proposal!.edit.filePath).toBe('manuscript/chapter-one/opening.md')

    // Errors come back as tool errors, never crashes.
    const failed = (await bridged!.handler({
      fname: 'manuscript/chapter-one/opening.md',
      oldText: 'text that does not exist',
      newText: 'x'
    })) as { isError?: boolean; content: Array<{ text: string }> }
    expect(failed.isError).toBe(true)
    expect(failed.content[0].text).toMatch(/Error:/)
  })
})

// ---- Probe classification --------------------------------------------------------

// ---- Provider parity (the LangGraph experience, on the SDK) --------------------

describe('provider parity', () => {
  it('subagents carry the per-turn brief; drafters get the handoff doctrine', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('approvals')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-brief' } }
    )
    const agents = harness.sdk.calls[0].options.agents as Record<string, { prompt: string }>
    expect(agents.drafter.prompt).toContain('PROJECT BRIEF (test)')
    expect(agents.drafter.prompt).toContain('SCENE HANDOFF')
    expect(agents.drafter.prompt).toContain('get_scene_handoff')
    // Every role gets the brief; only drafters get the addendum.
    expect(agents.auditor.prompt).toContain('PROJECT BRIEF (test)')
    expect(agents.auditor.prompt).not.toContain('SCENE HANDOFF')
  })

  it('queued steering notes ride the next invoke and drain exactly once', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    harness.steering.push('make it rain', 'shorter sentences')
    const graph = harness.runner.buildGraph()
    await graph.invoke(
      { messages: [{ content: 'draft on' }] },
      { configurable: { thread_id: 't-steer' } }
    )
    expect(harness.sdk.calls[0].prompt).toContain('[Writer, mid-run]: make it rain')
    expect(harness.sdk.calls[0].prompt).toContain('[Writer, mid-run]: shorter sentences')
    await graph.invoke(
      { messages: [{ content: 'continue' }] },
      { configurable: { thread_id: 't-steer' } }
    )
    expect(harness.sdk.calls[1].prompt).not.toContain('[Writer, mid-run]')
  })

  it('max-turns exhaustion surfaces as the graceful budget error, not a failure', async() => {
    const harness = await makeHarness([
      initMessage('s'),
      { type: 'result', subtype: 'error_max_turns', is_error: true, errors: [] }
    ])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await expect(
      harness.runner.buildGraph().invoke(
        { messages: [{ content: 'write the whole book' }] },
        { configurable: { thread_id: 't-budget' } }
      )
    ).rejects.toMatchObject({ name: 'GraphRecursionError' })
  })

  it('the THROWN max-turns shape maps to the same budget error', async() => {
    // The real runtime often throws instead of yielding the error result
    // (live pin in claude-subscription.spec.ts) — same graceful path.
    const harness = await makeHarness([initMessage('s')])
    cleanupRoots.push(harness.root)
    const originalQuery = harness.sdk.query.bind(harness.sdk)
    harness.sdk.query = (params) => {
      harness.sdk.calls.push({ prompt: params.prompt, options: params.options ?? {} })
      async function * gen(): AsyncGenerator<SdkMessage, void> {
        yield initMessage('s')
        throw new Error('Claude Code returned an error result: Reached maximum number of turns (1)')
      }
      const stream = gen() as ReturnType<ScriptedSdk['query']>
      stream.interrupt = async() => undefined
      return stream
    }
    harness.runner.setMode('auto')
    await expect(
      harness.runner.buildGraph().invoke(
        { messages: [{ content: 'hi' }] },
        { configurable: { thread_id: 't-thrown' } }
      )
    ).rejects.toMatchObject({ name: 'GraphRecursionError' })
    harness.sdk.query = originalQuery
  })

  it('other error subtypes still fail with their real message', async() => {
    const harness = await makeHarness([
      initMessage('s'),
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['boom'] }
    ])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await expect(
      harness.runner.buildGraph().invoke(
        { messages: [{ content: 'hi' }] },
        { configurable: { thread_id: 't-err' } }
      )
    ).rejects.toSatisfy((error: Error) => error.name !== 'GraphRecursionError')
  })

  it('main thread carries the SUPERVISOR surface; worker tools stay registered but gated', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-surface' } }
    )
    const options = harness.sdk.calls[0].options
    const allowed = options.allowedTools as string[]
    // Worker-only tools are not on the main-thread allowlist…
    expect(allowed).not.toContain(`${MCP_TOOL_PREFIX}log_continuity_issue`)
    expect(allowed).not.toContain(`${MCP_TOOL_PREFIX}read_unit`)
    // …but supervisor tools are, and the server still registers worker tools
    // (subagents execute them through the same in-process server).
    expect(allowed).toContain(`${MCP_TOOL_PREFIX}propose_text_edit`)
    const registered = harness.sdk.registeredTools.map((tool) => tool.name)
    expect(registered).toContain('log_continuity_issue')
    expect(registered).toContain('read_unit')
    expect(registered).toContain('get_scene_handoff')

    // The deny layer: main-thread calls to worker tools bounce with
    // delegation guidance; the SAME call from inside a subagent is allowed.
    const canUseTool = options.canUseTool as (
      name: string,
      input: Record<string, unknown>,
      extra?: { agentID?: string }
    ) => Promise<{ behavior: string; message?: string }>
    const denied = await canUseTool(`${MCP_TOOL_PREFIX}log_continuity_issue`, {}, {})
    expect(denied.behavior).toBe('deny')
    expect(denied.message).toContain('Task')
    const fromSubagent = await canUseTool(
      `${MCP_TOOL_PREFIX}log_continuity_issue`,
      {},
      { agentID: 'sub-1' }
    )
    expect(fromSubagent.behavior).toBe('allow')
    const supervisorTool = await canUseTool(`${MCP_TOOL_PREFIX}search_manuscript`, {}, {})
    expect(supervisorTool.behavior).toBe('allow')
  })
})

describe('stop means stop', () => {
  it('an already-aborted signal never starts an SDK query', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('never')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    const controller = new AbortController()
    controller.abort()
    const response = await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'keep going' }] },
      { configurable: { thread_id: 't-stopped' }, signal: controller.signal } as never
    )
    expect(response.messages[0].content).toBe('')
    // No query was created — a post-Stop invoke cannot resurrect the run.
    expect(harness.sdk.calls).toHaveLength(0)
  })
})

describe('duplicate-spawn guard (canUseTool on Task)', () => {
  it('an identical (type, task) spawn is bounced; distinct ones pass', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-dup' } }
    )
    const canUseTool = harness.sdk.calls[0].options.canUseTool as (
      name: string,
      input: Record<string, unknown>,
      extra?: { agentID?: string }
    ) => Promise<{ behavior: string; message?: string }>

    const spawn = { subagent_type: 'researcher', prompt: 'Research 1890s lighthouse fuel.' }
    expect((await canUseTool('Task', spawn)).behavior).toBe('allow')
    // Same task again (whitespace/case noise included) → bounced.
    const dup = await canUseTool('Task', {
      subagent_type: 'researcher',
      prompt: '  research 1890s LIGHTHOUSE fuel.  '
    })
    expect(dup.behavior).toBe('deny')
    expect(dup.message).toMatch(/identical agent/i)
    // A different task or a different role passes.
    expect(
      (await canUseTool('Task', { subagent_type: 'researcher', prompt: 'Research tides.' }))
        .behavior
    ).toBe('allow')
    expect(
      (
        await canUseTool('Task', {
          subagent_type: 'auditor',
          prompt: 'Research 1890s lighthouse fuel.'
        })
      ).behavior
    ).toBe('allow')

    // A NEW turn starts a clean slate.
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'again' }] },
      { configurable: { thread_id: 't-dup' } }
    )
    const nextCanUse = harness.sdk.calls[1].options.canUseTool as typeof canUseTool
    expect((await nextCanUse('Task', spawn)).behavior).toBe('allow')
  })
})

describe('connect-time probe', () => {
  it('passes on a clean result and coaches on auth failures', async() => {
    const good = await makeHarness([initMessage('s'), successResult('ready')])
    cleanupRoots.push(good.root)
    await expect(good.runner.probe()).resolves.toBeUndefined()

    const bad = await makeHarness([
      initMessage('s'),
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: 'authentication_failed: no credentials found'
      }
    ])
    cleanupRoots.push(bad.root)
    await expect(bad.runner.probe()).rejects.toThrow(/setup-token|log in/i)
  })
})
