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
import {
  AgentSDKRunner,
  DISALLOWED_BUILTIN_TOOLS,
  SDK_SILENCE_TIMEOUT_MS,
  SPAWN_SLOT_STALE_MS
} from '../../../src/main/services/ai/agentSdk/AgentSDKRunner'
import {
  MCP_TOOL_PREFIX,
  SPAWN_TOOL_NAMES,
  TOOL_OUTPUT_CHAR_CAP,
  WRITE_TOOL_NAMES,
  buildSdkAgents,
  mainThreadToolNames,
  stripMcpPrefix
} from '../../../src/main/services/ai/agentSdk/toolBridge'
import { executeHttpTool } from '../../../src/main/services/ai/agentSdk/httpMcpServer'
import {
  MODE_BUDGETS,
  HEAVY_ROLES,
  HEAVY_ROLE_RECURSION_MULTIPLIER
} from '../../../src/main/services/ai/orchestrator/roles'
import { AgentToolService, AgentToolPackLoader } from '../../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../../src/main/services/ai/AgentToolHandlers'
import { registerNovelAgentToolHandlers } from '../../../src/main/services/ai/NovelToolHandlers'
import { registerWebAgentToolHandlers } from '../../../src/main/services/ai/WebToolHandlers'
import type { OrchestratorCallbacks } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { DESTRUCTIVE_TOOLS } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import type {
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IAgentStatus,
  ITokenUsageUpdate
} from '../../../src/shared/types/langgraph'

const TOOL_PACK = path.join(__dirname, '../../../static/agentTools.json')

// Adapter: drive the new PreToolUse gate the way the old canUseTool tests
// did, mapping the hook's result shape back to {behavior, message,
// updatedInput}. gating moved off canUseTool onto the hook (prj13 fix).
const gateAdapter =
  (runner: { preToolUseGate: (i: unknown) => Promise<Record<string, unknown>> }) =>
    async(
      name: string,
      input: Record<string, unknown>,
      toolUseId?: string
    ): Promise<{ behavior?: string; message?: string; updatedInput?: Record<string, unknown> }> => {
      const out = await runner.preToolUseGate({
        tool_name: name,
        tool_input: input,
        tool_use_id: toolUseId
      })
      const hso = (out.hookSpecificOutput ?? {}) as {
        permissionDecision?: string
        permissionDecisionReason?: string
        updatedInput?: Record<string, unknown>
      }
      return {
        behavior: hso.permissionDecision,
        message: hso.permissionDecisionReason,
        updatedInput: hso.updatedInput
      }
    }

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
  /** Live GATHERED THIS TURN section (mutable mid-test to prove liveness). */
  gathered: { value: string }
  stateDir: string
  root: string
  service: AgentToolService
}

const makeHarness = async(
  script: SdkMessage[],
  apiKey = '',
  options: { silenceMs?: number } = {}
): Promise<Harness> => {
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
  const gathered = { value: '' }
  const callbacks: OrchestratorCallbacks = {
    emitActivity: (event) => activity.push(event),
    requestApproval: async(request) => {
      approvals.push(request)
      return approveNext.value
    },
    buildBrief: async() => 'PROJECT BRIEF (test): one chapter, one scene.',
    emitAgentStatus: (status) => statuses.push(status),
    emitTokenUsage: (update) => usage.push(update),
    drainSteering: () => steering.splice(0),
    buildGathered: () => gathered.value
  }

  const sdk = makeSdk(script)
  const stateDir = path.join(root, '.wordbird', 'agent-state')
  const runner = new AgentSDKRunner({
    config: { provider: 'claude-code', apiKey, model: 'sonnet' },
    callbacks,
    toolService: service,
    stateDir,
    projectRoot: () => root,
    sdkModule: sdk as never,
    ...(options.silenceMs === undefined ? {} : { silenceMs: options.silenceMs })
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
    gathered,
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

  it('sets a generous MCP_TOOL_TIMEOUT so slow in-process tools do not kill the stream', async() => {
    // prj13 wedge: the in-process MCP server has no per-server timeout
    // field, so a slow web_fetch hitting the short default closed the tool
    // stream and every later call (local reads too) returned "no output".
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)
    const env = harness.runner.buildEnv({ PATH: '/usr/bin' } as NodeJS.ProcessEnv)
    // Must outlast a rate-limited web fetch's whole retry chain
    // (~75s worst case) or the ceiling cuts retries the backoff would absorb.
    expect(Number(env.MCP_TOOL_TIMEOUT)).toBeGreaterThanOrEqual(90_000)
    // Respect an operator override rather than clobbering it.
    const overridden = harness.runner.buildEnv({
      MCP_TOOL_TIMEOUT: '99999'
    } as unknown as NodeJS.ProcessEnv)
    expect(overridden.MCP_TOOL_TIMEOUT).toBe('99999')
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

  it('denies every SDK built-in except the spawn tool — AskUserQuestion included', () => {
    // 2026-07-19 live repro: the model reached the built-in AskUserQuestion
    // (not on the allowlist → rides the canUseTool PERMISSION STREAM), which
    // collapsed under parallel-subagent load ("AbortError: Stream closed").
    // Every non-spawn built-in must be denied so the model uses
    // mcp__wordbird__ask_writer instead. Agent/Task must survive (spawns).
    expect(DISALLOWED_BUILTIN_TOOLS).toContain('AskUserQuestion')
    for (const spawn of SPAWN_TOOL_NAMES) {
      expect(DISALLOWED_BUILTIN_TOOLS, spawn).not.toContain(spawn)
    }
    // A representative sample of the newer built-ins the stale list missed.
    for (const builtin of ['ExitPlanMode', 'TodoWrite', 'Artifact', 'WebSearch']) {
      expect(DISALLOWED_BUILTIN_TOOLS, builtin).toContain(builtin)
    }
  })

  it('every SDK subagent carries a per-role maxTurns cap (the endless-spin bound)', () => {
    // prj12 (2026-07-19): a researcher subagent issued 38 tool calls,
    // re-reading the same page a dozen times, because nothing capped it.
    // Each subagent must carry the SAME step budget LangGraph passes its
    // workers (workerRecursionLimit) so both providers bound work alike.
    for (const mode of ['ask', 'approvals', 'auto'] as const) {
      const base = MODE_BUDGETS[mode].workerRecursionLimit
      const agents = buildSdkAgents(mode)
      for (const [role, def] of Object.entries(agents)) {
        expect(def.maxTurns, `${mode}/${role}`).toBeGreaterThan(0)
        const expected = HEAVY_ROLES.includes(role as never)
          ? base * HEAVY_ROLE_RECURSION_MULTIPLIER
          : base
        expect(def.maxTurns, `${mode}/${role}`).toBe(expected)
      }
      // A non-heavy role (researcher) is bounded to the base; a heavy one
      // (drafter) gets the multiplier for multi-unit sweeps.
      expect(agents.researcher.maxTurns).toBe(base)
      if (agents.drafter) {
        expect(agents.drafter.maxTurns).toBe(base * HEAVY_ROLE_RECURSION_MULTIPLIER)
      }
    }
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

  it('binds only WordBird MCP tools, never the file built-ins', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't' } }
    )

    const options = harness.sdk.calls[0].options
    const allowed = options.allowedTools as string[]
    // REVISED INVARIANT (prj13 empty-tools fix): NOTHING rides canUseTool —
    // it is removed entirely and gating moves to a PreToolUse hook. So
    // EVERYTHING is allowlisted, spawns and destructive included, and the
    // hook (matcher-scoped) does the dedup + writer-approval.
    expect(options.canUseTool).toBeUndefined()
    expect(allowed).toContain('Task')
    expect(allowed).toContain('Agent')
    expect(allowed).toContain(`${MCP_TOOL_PREFIX}propose_text_edit`)
    expect(allowed).toContain(`${MCP_TOOL_PREFIX}read_unit`)
    expect(allowed).toContain(`${MCP_TOOL_PREFIX}log_continuity_issue`)
    // Destructive tools are allowlisted too now — the PreToolUse hook, not
    // an allowlist gap, raises the writer-approval card.
    for (const destructive of ['delete_unit', 'delete_file', 'restore_snapshot']) {
      expect(allowed).toContain(`${MCP_TOOL_PREFIX}${destructive}`)
    }
    // The gate is wired as a matcher-scoped PreToolUse hook.
    const hooks = options.hooks as { PreToolUse?: Array<{ matcher?: string; hooks: unknown[] }> }
    expect(hooks.PreToolUse?.[0]?.matcher).toMatch(/Agent\|Task/)
    expect(hooks.PreToolUse?.[0]?.hooks).toHaveLength(1)
    const disallowed = options.disallowedTools as string[]
    for (const builtin of ['Bash', 'Read', 'Write', 'Edit', 'WebFetch']) {
      expect(disallowed).toContain(builtin)
    }
    // The user's personal CLAUDE.md/settings never leak into a novel session.
    expect(options.settingSources).toEqual([])
    // The brief and the Task-spawn doctrine ride the system prompt.
    expect(String(options.systemPrompt)).toContain('PROJECT BRIEF (test)')
    expect(String(options.systemPrompt)).toContain('Agent')
  })

  it('destructive tools require writer approval through the PreToolUse hook', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't' } }
    )
    const canUseTool = gateAdapter(harness.runner)

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

    // executeHttpTool is the exact wrapper the loopback HTTP MCP server
    // registers for every tool — it runs in-process through runForModel.
    const result = await executeHttpTool(harness.service, 'propose_text_edit', {
      fname: 'manuscript/chapter-one/opening.md',
      oldText: 'The keeper waited.',
      newText: 'The keeper waited for the tide.'
    })

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toMatch(/Edit proposal created/i)
    expect(proposal).not.toBeNull()
    expect(proposal!.edit.filePath).toBe('manuscript/chapter-one/opening.md')

    // Errors come back as tool errors, never crashes.
    const failed = await executeHttpTool(harness.service, 'propose_text_edit', {
      fname: 'manuscript/chapter-one/opening.md',
      oldText: 'text that does not exist',
      newText: 'x'
    })
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

  it('MODE MATRIX: the permission-stream invariant holds in every mode', async() => {
    // For each mode: (a) every subagent tool is registered, (b) everything
    // registered minus destructive is ALLOWLISTED (subagent traffic must
    // never ride the permission stream — prj7 incident, 2026-07-18),
    // (c) propose_* exist outside ask and not in it, (d) destructive tools
    // never appear in a subagent definition.
    for (const mode of ['ask', 'approvals', 'auto'] as const) {
      const harness = await makeHarness([initMessage('s'), successResult('ok')])
      cleanupRoots.push(harness.root)
      harness.runner.setMode(mode)
      await harness.runner.buildGraph().invoke(
        { messages: [{ content: 'hi' }] },
        { configurable: { thread_id: `t-matrix-${mode}` } }
      )
      const options = harness.sdk.calls[0].options
      const allowed = new Set(options.allowedTools as string[])
      const agents = options.agents as Record<string, { tools: string[] }>
      // The loopback HTTP MCP server registers ALL tools; mode gating lives
      // in the allowlist + subagent tool lists, so those are what we pin.

      // No subagent def may carry a destructive tool (a listed tool is
      // pre-approved inside the subagent, shadowing the writer-approval gate).
      for (const [roleName, def] of Object.entries(agents)) {
        for (const prefixed of def.tools) {
          const bare = prefixed.replace(MCP_TOOL_PREFIX, '')
          expect(
            DESTRUCTIVE_TOOLS.includes(bare),
            `${mode}/${roleName}: destructive ${bare} in subagent def`
          ).toBe(false)
        }
      }
      // ask mode is mechanically read-only: no write tool is allowlisted, and
      // no subagent may list one.
      if (mode === 'ask') {
        for (const write of WRITE_TOOL_NAMES) {
          expect(allowed.has(`${MCP_TOOL_PREFIX}${write}`), `ask: ${write} allowlisted`).toBe(false)
        }
        for (const [roleName, def] of Object.entries(agents)) {
          for (const prefixed of def.tools) {
            expect(
              WRITE_TOOL_NAMES.includes(prefixed.replace(MCP_TOOL_PREFIX, '')),
              `ask/${roleName}: write tool in subagent def`
            ).toBe(false)
          }
        }
      }
      const hasPropose = allowed.has(`${MCP_TOOL_PREFIX}propose_text_edit`)
      expect(hasPropose, mode).toBe(mode !== 'ask')
    }
  })
})

describe('tool failures are VISIBLE', () => {
  it('an errored tool_result becomes an activity line naming the tool', async() => {
    const harness = await makeHarness([
      initMessage('s'),
      assistantToolUse(`${MCP_TOOL_PREFIX}wiki_read`, { title: 'Elam' }, 'tu-fail'),
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu-fail',
              is_error: true,
              content: 'Tool permission request failed: AbortError: Stream closed'
            }
          ]
        }
      },
      successResult('done')
    ])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-fail' } }
    )
    const failure = harness.activity.find((event) => /tool failed — wiki_read/.test(event.label))
    expect(failure).toBeDefined()
    expect(failure?.detail).toContain('Stream closed')
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

describe('duplicate-spawn guard (PreToolUse hook on Task)', () => {
  it('an identical (type, task) spawn is bounced; distinct ones pass', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-dup' } }
    )
    const canUseTool = gateAdapter(harness.runner)

    const spawn = { subagent_type: 'researcher', prompt: 'Research 1890s lighthouse fuel.' }
    // Current runtime name ('Agent'), legacy name ('Task'), and even a
    // HYPOTHETICAL future rename ('Delegate') — detection is structural
    // (subagent_type input), so renames can't kill the guard again.
    expect((await canUseTool('Agent', spawn)).behavior).toBe('allow')
    const dupLegacyName = await canUseTool('Task', {
      subagent_type: 'researcher',
      prompt: '  research 1890s LIGHTHOUSE fuel.  '
    })
    expect(dupLegacyName.behavior).toBe('deny')
    expect(dupLegacyName.message).toMatch(/identical agent/i)
    const dupFutureName = await canUseTool('Delegate', {
      subagent_type: 'researcher',
      prompt: 'Research 1890s lighthouse fuel.'
    })
    expect(dupFutureName.behavior).toBe('deny')
    // A different task or a different role passes.
    expect(
      (await canUseTool('Agent', { subagent_type: 'researcher', prompt: 'Research tides.' }))
        .behavior
    ).toBe('allow')
    expect(
      (
        await canUseTool('Agent', {
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
    const nextCanUse = gateAdapter(harness.runner)
    expect((await nextCanUse('Task', spawn)).behavior).toBe('allow')
  })

  it('serializes subagents: a second concurrent spawn is denied, reset on a new turn', async() => {
    // prj13 empty-tools race: parallel subagents collapse the in-process
    // tool channel. The gate caps live concurrency at 1 — a second spawn
    // while one is in flight is denied so the model spawns sequentially.
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-serial' } }
    )
    const gate = gateAdapter(harness.runner)

    // First spawn reserves the single slot (distinct ids required — the
    // gate keys concurrency on tool_use_id).
    const first = await gate('Agent', { subagent_type: 'researcher', prompt: 'Aaa' }, 'id-a')
    expect(first.behavior).toBe('allow')
    // A genuinely DIFFERENT spawn (not a dup) is still denied — a slot is busy.
    const second = await gate('Agent', { subagent_type: 'drafter', prompt: 'Bbb' }, 'id-b')
    expect(second.behavior).toBe('deny')
    expect(second.message).toMatch(/one at a time|already running/i)

    // A NEW turn clears in-flight tracking → spawns allowed again.
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'again' }] },
      { configurable: { thread_id: 't-serial' } }
    )
    const gate2 = gateAdapter(harness.runner)
    expect(
      (await gate2('Agent', { subagent_type: 'researcher', prompt: 'Ccc' }, 'id-c')).behavior
    ).toBe('allow')
  })

  it('reclaims a slot held by a spawn that died without reporting back', async() => {
    // A subagent that fails hard emits NO tool_result, so the normal release
    // never runs. Without reclamation its slot stays taken and every later
    // spawn is denied for the rest of the turn — the supervisor then looks
    // like it is waiting forever (writer report, 2026-07-20).
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-stale' } }
    )
    const gate = gateAdapter(harness.runner)

    expect((await gate('Agent', { subagent_type: 'researcher', prompt: 'A' }, 'dead')).behavior)
      .toBe('allow')
    // Still fresh → the next spawn waits its turn.
    expect((await gate('Agent', { subagent_type: 'drafter', prompt: 'B' }, 'b')).behavior)
      .toBe('deny')

    // Pretend the dead spawn was admitted longer ago than the stale window.
    const slots = (
      harness.runner as unknown as { _inFlightSpawnIds: Map<string, number> }
    )._inFlightSpawnIds
    slots.set('dead', Date.now() - SPAWN_SLOT_STALE_MS - 1)

    expect(
      (await gate('Agent', { subagent_type: 'drafter', prompt: 'C' }, 'c')).behavior,
      'a dead subagent must not wedge the gate shut'
    ).toBe('allow')
  })
})

describe('Stop landing in the pre-stream window (missed-abort pin)', () => {
  it('an abort during brief-building still interrupts the stream promptly', async() => {
    // Live repro 2026-07-19: the abort listener attaches AFTER several
    // awaits (SDK load, brief build, session read). A Stop in that window
    // aborted a signal with no listener — addEventListener on an
    // already-aborted signal never fires — and the whole turn ran to
    // completion. The runner must check the signal after attaching.
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)

    let interrupts = 0
    let interrupted = false
    const sdk = {
      tool: (name: string) => ({ name }),
      createSdkMcpServer: (options: { name: string }) => ({ type: 'sdk', name: options.name }),
      query: () => {
        async function * gen(): AsyncGenerator<SdkMessage, void> {
          yield initMessage('s-abort')
          if (interrupted) return
          yield successResult('should never be reached after an interrupt')
        }
        const stream = gen() as AsyncGenerator<SdkMessage, void> & {
          interrupt?: () => Promise<unknown>
        }
        stream.interrupt = async() => {
          interrupts += 1
          interrupted = true
        }
        return stream
      }
    }

    const controller = new AbortController()
    const runner = new AgentSDKRunner({
      config: { provider: 'claude-code', apiKey: '', model: 'sonnet' },
      callbacks: {
        emitActivity: () => {},
        requestApproval: async() => true,
        // The Stop lands while the brief is still being built — inside
        // the invoke, before the stream exists.
        buildBrief: async() => {
          controller.abort()
          return 'PROJECT BRIEF (test)'
        }
      },
      toolService: harness.service,
      stateDir: harness.stateDir,
      sdkModule: sdk as never
    })
    runner.setMode('ask')

    await runner.buildGraph().invoke(
      { messages: [{ content: 'research something long' }] },
      { configurable: { thread_id: 't-missed-abort' }, signal: controller.signal }
    )
    expect(interrupts).toBe(1)
  })
})

describe('Stop escalates on a stubborn stream (hard-kill pin)', () => {
  it('when interrupt() does nothing, the SDK abortController + close() end the run', async() => {
    // interrupt() is a SOFT request the runtime can outlive (queue-drain
    // semantics; live repro 2026-07-19). The runner must escalate after a
    // bounded grace: abort the SDK's own abortController and close() the
    // stream — Stop is a guarantee, not a request.
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)

    let closed = false
    let capturedOptions: Record<string, unknown> = {}
    const sdk = {
      tool: (name: string) => ({ name }),
      createSdkMcpServer: (options: { name: string }) => ({ type: 'sdk', name: options.name }),
      query: ({ options }: { options: Record<string, unknown> }) => {
        capturedOptions = options
        async function * gen(): AsyncGenerator<SdkMessage, void> {
          yield initMessage('s-stubborn')
          // A "stream that will not die": keeps yielding until closed.
          for (let i = 0; i < 200; i += 1) {
            if (closed) return
            await new Promise((resolve) => setTimeout(resolve, 50))
            yield { type: 'assistant', message: { content: [] } }
          }
        }
        const stream = gen() as AsyncGenerator<SdkMessage, void> & {
          interrupt?: () => Promise<unknown>
          close?: () => void
        }
        stream.interrupt = async() => undefined // deliberately useless
        stream.close = () => {
          closed = true
        }
        return stream
      }
    }

    const controller = new AbortController()
    const runner = new AgentSDKRunner({
      config: { provider: 'claude-code', apiKey: '', model: 'sonnet' },
      callbacks: { emitActivity: () => {}, requestApproval: async() => true },
      toolService: harness.service,
      stateDir: harness.stateDir,
      sdkModule: sdk as never
    })
    runner.setMode('ask')

    const started = Date.now()
    const pending = runner.buildGraph().invoke(
      { messages: [{ content: 'go' }] },
      { configurable: { thread_id: 't-stubborn' }, signal: controller.signal }
    )
    setTimeout(() => controller.abort(), 100)
    await pending
    // Ended via the escalation (~100ms abort + 2s grace), nowhere near
    // the stream's natural ~10s lifetime.
    expect(Date.now() - started).toBeLessThan(6000)
    expect(closed).toBe(true)
    // The SDK-level kill switch was wired into the query options.
    const sdkController = capturedOptions.abortController as AbortController
    expect(sdkController).toBeInstanceOf(AbortController)
    expect(sdkController.signal.aborted).toBe(true)
  }, 15000)
})

describe('Stop reaches in-process tools (the bridge signal)', () => {
  it('an aborted turn signal makes every bridged tool refuse before running', async() => {
    // Root cause of "Stop doesn't stop" (live report, 2026-07-18):
    // interrupt() only halts the model loop — queued mcp__wordbird__
    // calls had NO signal and ran to completion, retry sleeps included.
    // executeHttpTool threads getSignal into runForModel exactly as the
    // loopback HTTP MCP server does.
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)
    const controller = new AbortController()
    const getSignal = (): AbortSignal => controller.signal

    // Before Stop: the tool runs normally.
    const before = await executeHttpTool(harness.service, 'list_structure', {}, getSignal)
    expect(before.isError).not.toBe(true)

    controller.abort()
    const after = await executeHttpTool(harness.service, 'list_structure', {}, getSignal)
    expect(after.isError).toBe(true)
    expect(JSON.stringify(after.content)).toMatch(/stopped by writer/i)
  })

  it('points the SDK at the loopback HTTP MCP server (alwaysLoad, type http)', async() => {
    // The empty-tools fix: WordBird tools are served over a local HTTP MCP
    // server (results survive) instead of the in-process transport (drops
    // them). The config the SDK receives must be type:'http' + alwaysLoad.
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-http' } }
    )
    const servers = harness.sdk.calls[0].options.mcpServers as Record<
      string,
      { type?: string; alwaysLoad?: boolean; url?: string }
    >
    expect(servers.wordbird.type).toBe('http')
    expect(servers.wordbird.alwaysLoad).toBe(true)
    expect(servers.wordbird.url).toMatch(/^http:\/\/127\.0\.0\.1:/)
  })
})

describe('live-suite thrift options', () => {
  it('turnBudget caps recursionLimit (maxTurns) below the mode default', async() => {
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)
    const capped = new AgentSDKRunner({
      config: { provider: 'claude-code', apiKey: '', model: 'sonnet' },
      callbacks: {
        emitActivity: () => {},
        requestApproval: async() => true
      },
      toolService: harness.service,
      stateDir: harness.stateDir,
      turnBudget: 10
    })
    capped.setMode('auto')
    expect(capped.recursionLimit()).toBe(10)
    // Unset = the generous mode-scaled default (production behavior).
    const uncapped = new AgentSDKRunner({
      config: { provider: 'claude-code', apiKey: '', model: 'sonnet' },
      callbacks: {
        emitActivity: () => {},
        requestApproval: async() => true
      },
      toolService: harness.service,
      stateDir: harness.stateDir
    })
    uncapped.setMode('auto')
    expect(uncapped.recursionLimit()).toBeGreaterThan(10)
  })

  it('subagentModel pins every SDK agent definition; omitted = inherit', () => {
    const pinned = buildSdkAgents('auto', '', '', 'haiku')
    for (const agent of Object.values(pinned)) {
      expect(agent.model).toBe('haiku')
    }
    const inherit = buildSdkAgents('auto', '')
    for (const agent of Object.values(inherit)) {
      expect(agent.model).toBeUndefined()
    }
  })
})

describe('GATHERED THIS TURN on the SDK path (research ledger injection)', () => {
  it('buildSdkAgents appends the section to warm roles only — the auditor stays cold', () => {
    const agents = buildSdkAgents('auto', 'BRIEF-X', 'GATHERED-SENTINEL-42')
    expect(agents.researcher.prompt).toContain('GATHERED-SENTINEL-42')
    expect(agents.explorer.prompt).toContain('GATHERED-SENTINEL-42')
    expect(agents.drafter.prompt).toContain('GATHERED-SENTINEL-42')
    expect(agents.steward.prompt).toContain('GATHERED-SENTINEL-42')
    expect(agents.auditor.prompt).not.toContain('GATHERED-SENTINEL-42')
    // Omitting the section changes nothing (first invoke of a turn).
    const bare = buildSdkAgents('auto', 'BRIEF-X')
    expect(bare.researcher.prompt).not.toContain('GATHERED-SENTINEL-42')
  })

  it('the supervisor systemPrompt and subagent prompts carry the invoke-time section', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.gathered.value = 'GATHERED-AT-INVOKE'
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-g' } }
    )
    const options = harness.sdk.calls[0].options
    expect(String(options.systemPrompt)).toContain('GATHERED-AT-INVOKE')
    const agents = options.agents as Record<string, { prompt: string }>
    expect(agents.researcher.prompt).toContain('GATHERED-AT-INVOKE')
    expect(agents.auditor.prompt).not.toContain('GATHERED-AT-INVOKE')
  })

  it('spawns get the LIVE section via updatedInput; auditors and dedup stay untouched', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('ok')])
    cleanupRoots.push(harness.root)
    harness.gathered.value = 'GATHERED-EARLY'
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'hi' }] },
      { configurable: { thread_id: 't-live' } }
    )
    const canUseTool = gateAdapter(harness.runner)

    // The ledger grew between invoke start and this spawn — the spawn
    // must carry the CURRENT section, not the invoke-time snapshot.
    harness.gathered.value = 'GATHERED-LATE'
    const spawn = await canUseTool('Agent', {
      subagent_type: 'researcher',
      prompt: 'Research Elam religion.'
    })
    expect(spawn.behavior).toBe('allow')
    expect(String(spawn.updatedInput?.prompt)).toContain('Research Elam religion.')
    expect(String(spawn.updatedInput?.prompt)).toContain('GATHERED-LATE')

    // coldStart role: the auditor's task rides through untouched.
    const audit = await canUseTool('Agent', {
      subagent_type: 'auditor',
      prompt: 'Check continuity in chapter one.'
    })
    expect(audit.behavior).toBe('allow')
    expect(audit.updatedInput?.prompt).toBe('Check continuity in chapter one.')

    // Dedup keys on the ORIGINAL task text — the appended section can
    // never make an identical spawn look distinct.
    const dup = await canUseTool('Agent', {
      subagent_type: 'researcher',
      prompt: 'Research Elam religion.'
    })
    expect(dup.behavior).toBe('deny')
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

// ---- Graceful degradation under failure -------------------------------------
//
// Load-induced failures are EXPECTED (flaky network, a wedged tool, a dead
// subagent, a runtime that dies mid-stream). What matters is that the system
// DEGRADES rather than wedging or crashing: the failure reaches the model
// and the writer, the turn ends, and the NEXT turn still works. These pin
// recovery, not just error surfacing.

describe('failure handling: degrades, never wedges', () => {
  it('a tool that THROWS becomes a tool error, and the run keeps going', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('done')])
    cleanupRoots.push(harness.root)
    // read_unit on a nonexistent id throws inside the handler.
    const failed = await executeHttpTool(harness.service, 'read_unit', { unitId: 'nope' })
    expect(failed.isError).toBe(true)
    expect(failed.content[0].text).toMatch(/error/i)
    // The service is NOT poisoned — the next tool call still succeeds.
    const ok = await executeHttpTool(harness.service, 'list_structure', {})
    expect(ok.isError).toBeFalsy()
  })

  it('an oversized tool result is truncated, not dropped or crashed', async() => {
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)
    const huge = 'x'.repeat(TOOL_OUTPUT_CHAR_CAP * 2)
    fs.writeFileSync(path.join(harness.root, 'manuscript/chapter-one/opening.md'), huge)
    const result = await executeHttpTool(harness.service, 'read_project_file', {
      fname: 'manuscript/chapter-one/opening.md'
    })
    expect(result.isError).toBeFalsy()
    expect(result.content[0].text.length).toBeLessThan(TOOL_OUTPUT_CHAR_CAP + 200)
    expect(result.content[0].text).toMatch(/truncated/i)
  })

  it('a runtime that dies mid-stream surfaces the error AND leaves the next turn usable', async() => {
    // The wedge risk: an exception escaping the stream loop could leave the
    // runner holding turn state (in-flight spawns, active query) so every
    // later turn is refused. It must recover completely.
    const harness = await makeHarness([])
    cleanupRoots.push(harness.root)
    let call = 0
    const scripted: SdkMessage[] = [initMessage('s'), successResult('recovered')]
    ;(harness.sdk as unknown as { query: ScriptedSdk['query'] }).query = ({ prompt, options }) => {
      harness.sdk.calls.push({ prompt, options: options ?? {} })
      call += 1
      const dies = call === 1
      async function * gen(): AsyncGenerator<SdkMessage, void> {
        yield initMessage('s')
        if (dies) throw new Error('runtime died mid-stream')
        for (const message of scripted.slice(1)) yield message
      }
      const stream = gen() as ReturnType<ScriptedSdk['query']>
      stream.interrupt = async() => undefined
      return stream
    }
    harness.runner.setMode('auto')

    await expect(
      harness.runner.buildGraph().invoke(
        { messages: [{ content: 'first' }] },
        { configurable: { thread_id: 't-die' } }
      )
    ).rejects.toThrow(/runtime died/i)

    // RECOVERY: the very next turn on the SAME thread completes normally.
    const second = await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'second' }] },
      { configurable: { thread_id: 't-die' } }
    )
    expect(second.messages[0]?.content).toBe('recovered')
  })

  it('a failed subagent frees its slot immediately, so the next spawn proceeds', async() => {
    // The reported "waits forever": a dead subagent held the only
    // concurrency slot and every later spawn was denied for the rest of the
    // turn. A FAILED tool_result must release it at once — no waiting for
    // the stale-slot timeout.
    const harness = await makeHarness([
      initMessage('s'),
      assistantToolUse('Agent', { subagent_type: 'researcher', prompt: 'Research Elam' }, 'tu-sub'),
      userToolResult('tu-sub', true),
      successResult('done')
    ])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'go' }] },
      { configurable: { thread_id: 't-subfail' } }
    )

    // The writer SEES the failure (status row + activity line).
    expect(harness.statuses.some((s) => s.status === 'failed')).toBe(true)
    expect(
      harness.activity.some((event) => /tool failed/i.test(`${event.label} ${event.detail ?? ''}`))
    ).toBe(true)

    // …and the gate is open again for a genuinely different spawn.
    const gate = gateAdapter(harness.runner)
    expect(
      (await gate('Agent', { subagent_type: 'drafter', prompt: 'Draft it' }, 'tu-next')).behavior
    ).toBe('allow')
  })

  it('an abort mid-run ends the turn and does not poison the next one', async() => {
    const harness = await makeHarness([initMessage('s'), successResult('after-abort')])
    cleanupRoots.push(harness.root)
    harness.runner.setMode('auto')
    const controller = new AbortController()
    controller.abort()
    // An aborted turn resolves (empty) rather than hanging or throwing.
    const aborted = await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'stopped' }] },
      { configurable: { thread_id: 't-abort-recover' }, signal: controller.signal }
    )
    expect(typeof aborted.messages[0]?.content).toBe('string')

    const next = await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'again' }] },
      { configurable: { thread_id: 't-abort-recover' } }
    )
    expect(next.messages[0]?.content).toBe('after-abort')
  })
})

// ---- Negative cases: inject the failure, observe the reaction ----------------

describe('negative cases: a wedged runtime cannot hang the turn', () => {
  /** A stream that yields `head`, then goes silent forever. */
  const wedgingSdk = (harness: Harness, head: SdkMessage[]): void => {
    ;(harness.sdk as unknown as { query: ScriptedSdk['query'] }).query = ({ prompt, options }) => {
      harness.sdk.calls.push({ prompt, options: options ?? {} })
      async function * gen(): AsyncGenerator<SdkMessage, void> {
        for (const message of head) yield message
        // …and now nothing, ever.
        await new Promise(() => {})
      }
      const stream = gen() as ReturnType<ScriptedSdk['query']>
      stream.interrupt = async() => undefined
      return stream
    }
  }

  it('total silence surfaces as an ERROR, not a budget "continue"', async() => {
    // A wedged runtime is a genuine failure, distinct from running out of step
    // budget (max-turns → GraphRecursionError → "say continue"). It must NOT
    // wear the budget name, so the manager lets it through as a red error card
    // rather than the reassuring "say continue" reply.
    const harness = await makeHarness([], '', { silenceMs: 120 })
    cleanupRoots.push(harness.root)
    wedgingSdk(harness, [initMessage('s-wedge')])
    harness.runner.setMode('auto')

    const started = Date.now()
    await expect(
      harness.runner.buildGraph().invoke(
        { messages: [{ content: 'go' }] },
        { configurable: { thread_id: 't-wedge' } }
      )
    ).rejects.toSatisfy(
      (error: Error) =>
        error.name !== 'GraphRecursionError' && /stopped responding|no output/i.test(error.message)
    )
    // It gave up promptly instead of hanging.
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('a stream that keeps talking is NEVER cut short by the silence budget', async() => {
    // The timer is per-message: slow-but-alive work must survive. Heartbeats
    // arrive at half the budget, for longer than the budget in total.
    const harness = await makeHarness([], '', { silenceMs: 150 })
    cleanupRoots.push(harness.root)
    ;(harness.sdk as unknown as { query: ScriptedSdk['query'] }).query = ({ prompt, options }) => {
      harness.sdk.calls.push({ prompt, options: options ?? {} })
      async function * gen(): AsyncGenerator<SdkMessage, void> {
        yield initMessage('s-alive')
        for (let beat = 0; beat < 6; beat += 1) {
          await new Promise((resolve) => setTimeout(resolve, 75))
          yield assistantToolUse(`${MCP_TOOL_PREFIX}list_structure`, {}, `tu-${beat}`)
        }
        yield successResult('finished slowly')
      }
      const stream = gen() as ReturnType<ScriptedSdk['query']>
      stream.interrupt = async() => undefined
      return stream
    }
    harness.runner.setMode('auto')

    const response = await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'slow but alive' }] },
      { configurable: { thread_id: 't-alive' } }
    )
    expect(response.messages[0]?.content).toBe('finished slowly')
  })

  it('after a wedge the runner is reusable — the next turn completes', async() => {
    const harness = await makeHarness([], '', { silenceMs: 120 })
    cleanupRoots.push(harness.root)
    let call = 0
    ;(harness.sdk as unknown as { query: ScriptedSdk['query'] }).query = ({ prompt, options }) => {
      harness.sdk.calls.push({ prompt, options: options ?? {} })
      call += 1
      const wedge = call === 1
      async function * gen(): AsyncGenerator<SdkMessage, void> {
        yield initMessage('s')
        if (wedge) await new Promise(() => {})
        yield successResult('back to normal')
      }
      const stream = gen() as ReturnType<ScriptedSdk['query']>
      stream.interrupt = async() => undefined
      return stream
    }
    harness.runner.setMode('auto')

    await expect(
      harness.runner.buildGraph().invoke(
        { messages: [{ content: 'first' }] },
        { configurable: { thread_id: 't-wedge-recover' } }
      )
      // Surfaces as an error (not the budget path), and the runner survives it.
    ).rejects.toSatisfy((error: Error) => error.name !== 'GraphRecursionError')

    const second = await harness.runner.buildGraph().invoke(
      { messages: [{ content: 'second' }] },
      { configurable: { thread_id: 't-wedge-recover' } }
    )
    expect(second.messages[0]?.content).toBe('back to normal')
  })

  it('the silence budget defaults to the production value when unset', () => {
    expect(SDK_SILENCE_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000)
  })
})
