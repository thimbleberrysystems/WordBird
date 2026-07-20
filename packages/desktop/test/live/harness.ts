/**
 * Live E2E harness: the REAL Biscuit stack — the full agentTools.json
 * pack, real tool handlers, real ContextBuilder + ResearchLedger over a
 * scratch novel project — driven by a REAL model through ONE of two
 * provider backends behind a single facade:
 *
 *   subscription — the production AgentSDKRunner over the Claude Agent
 *                  SDK (Claude Pro/Max). Model 'sonnet' (LIVE_CLAUDE_MODEL
 *                  overrides; never opus — every turn bills the plan).
 *                  Primary target on a logged-in dev machine.
 *   openrouter   — the production Orchestrator over a free tool-calling
 *                  OpenRouter model. The CI path.
 *
 * Selection (see provider.ts): LIVE_PROVIDER forces; else subscription
 * when CLAUDE_CODE_OAUTH_TOKEN or a local Claude Code login exists; else
 * OpenRouter when OPENROUTER_KEY exists; else the suite skips.
 *
 * Token thrift: per-flow turnBudget caps, LIVE_SUBAGENT_MODEL=haiku
 * (optional), LIVE_HEAVY=1 gates expensive flows on subscription, and an
 * end-of-run LIVE TOKEN REPORT makes test cost visible.
 * LIVE_KEEP_ARTIFACTS=1 keeps temp projects + dumps activity/tokens for
 * post-mortem.
 *
 * Free-tier note: OpenRouter free models are rate-limited (~20 req/min).
 * The suite runs sequentially and the model client retries 429s.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { ChatOpenAI } from '@langchain/openai'
import { MemorySaver } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { Orchestrator } from '../../src/main/services/ai/orchestrator/Orchestrator'
import type { OrchestratorCallbacks } from '../../src/main/services/ai/orchestrator/Orchestrator'
import { AgentSDKRunner } from '../../src/main/services/ai/agentSdk/AgentSDKRunner'
import { AgentToolService, AgentToolPackLoader } from '../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../src/main/services/ai/AgentToolHandlers'
import { contextBuilder } from '../../src/main/services/ai/ContextBuilder'
import { ResearchLedger } from '../../src/main/services/ai/ResearchLedger'
import {
  driveResearchBackstop,
  emptyObservations,
  observeResearchTool,
  type TurnObservations
} from '../../src/main/services/ai/coherencePass'
import { selectLiveProvider, tokenReportLine, type LiveProvider } from './provider'
import type {
  AgentPermissionMode,
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IAgentStatus,
  IContextUsage,
  ITokenTally
} from '../../src/shared/types/langgraph'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const apiKey = (): string =>
  process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || ''

// ---- Provider selection (once per run) --------------------------------------

const CLAUDE_CREDENTIALS = path.join(os.homedir(), '.claude', '.credentials.json')

export const liveSelection = selectLiveProvider({
  env: process.env,
  hasClaudeLogin: fs.existsSync(CLAUDE_CREDENTIALS)
})

/** The provider this run drives, or null → the suite skips. */
export const liveProvider: LiveProvider | null = liveSelection.provider

export const hasLiveProvider = (): boolean => liveProvider !== null

if (!liveProvider && liveSelection.reason) {
  console.info(`[live] suite will skip: ${liveSelection.reason}`)
}

/** Heavy (expensive) flows: always on the free CI provider, opt-in
 * (LIVE_HEAVY=1) when every turn bills the writer's subscription. */
export const heavyEnabled = (): boolean =>
  liveProvider === 'openrouter' || process.env.LIVE_HEAVY === '1'

// ---- Run-wide token accounting ----------------------------------------------

const tokenRegistry: Array<{ label: string; tally: () => ITokenTally }> = []

/** Print the LIVE TOKEN REPORT — call from a root afterAll. */
export const printTokenReport = (): void => {
  if (tokenRegistry.length === 0) return
  const total = { inputTokens: 0, outputTokens: 0, calls: 0, byRole: {} }
  console.info(`\nLIVE TOKEN REPORT (${liveProvider}):`)
  for (const { label, tally } of tokenRegistry) {
    const t = tally()
    total.inputTokens += t.inputTokens
    total.outputTokens += t.outputTokens
    total.calls += t.calls
    console.info(`  ${tokenReportLine(label, t)}`)
  }
  console.info(`  ${tokenReportLine('TOTAL', total)}`)
}

/** Preference order for auto-picking a free tool-calling model. */
const FREE_MODEL_PREFERENCES = [
  'nvidia/nemotron-3-super',
  'tencent/hy3',
  'nvidia/nemotron-3-nano-30b',
  'qwen/qwen3-next',
  'google/gemma-4',
  'openai/gpt-oss'
]

let cachedModel: string | null = null
// Models that died mid-run (their shared pool flickers even after a
// successful probe) — excluded from re-resolution.
const blacklisted = new Set<string>()

export const activeModel = (): string => {
  if (!cachedModel) throw new Error('resolveModel() has not run yet')
  return cachedModel
}

/** Drop the current model (pool exhausted mid-run) and probe for another. */
export const failoverModel = async(): Promise<string> => {
  if (cachedModel) blacklisted.add(cachedModel)
  cachedModel = null
  return resolveModel()
}

/**
 * Free models share upstream pools that regularly exhaust — a model that is
 * in the catalog can still 429 every request. Only a live probe proves
 * capacity.
 */
const probeModel = async(id: string): Promise<boolean> => {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: id,
        messages: [{ role: 'user', content: 'say ok' }],
        max_tokens: 5
      }),
      signal: AbortSignal.timeout(45_000)
    })
    if (!response.ok) return false
    const body = (await response.json()) as { error?: unknown }
    return !body.error
  } catch {
    return false
  }
}

/**
 * Resolve the model to test with. A concrete OPENROUTER_MODEL wins;
 * otherwise (or for the sentinel "openrouter/free") query the live catalog
 * for models that are BOTH free and tool-capable, then PROBE them in
 * preference order and take the first with real capacity right now.
 */
export const resolveModel = async(): Promise<string> => {
  const requested = process.env.OPENROUTER_MODEL
  if (requested && requested !== 'openrouter/free') {
    // Pinned models must land in the cache too — activeModel() reads it.
    cachedModel = requested
    return requested
  }
  if (cachedModel) return cachedModel

  const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey()}` }
  })
  if (!response.ok) {
    throw new Error(`OpenRouter /models failed: ${response.status} ${await response.text()}`)
  }
  const body = (await response.json()) as {
    data: Array<{
      id: string
      pricing?: { prompt?: string; completion?: string }
      supported_parameters?: string[]
    }>
  }
  const free = body.data.filter(
    (m) =>
      m.id.endsWith(':free') &&
      !blacklisted.has(m.id) &&
      Number(m.pricing?.prompt ?? '1') === 0 &&
      Number(m.pricing?.completion ?? '1') === 0 &&
      (m.supported_parameters ?? []).includes('tools')
  )
  if (free.length === 0) {
    throw new Error('No free tool-calling models available on OpenRouter right now.')
  }
  const ranked = free.sort((a, b) => {
    const rank = (id: string): number => {
      const index = FREE_MODEL_PREFERENCES.findIndex((p) => id.startsWith(p))
      return index === -1 ? FREE_MODEL_PREFERENCES.length : index
    }
    return rank(a.id) - rank(b.id)
  })
  for (const candidate of ranked) {
    if (await probeModel(candidate.id)) {
      cachedModel = candidate.id

      console.info(`[live-e2e] using free model with live capacity: ${candidate.id}`)
      return cachedModel
    }

    console.info(`[live-e2e] skipping ${candidate.id} (no capacity right now)`)
  }
  throw new Error('Every free tool-calling model is rate-limited upstream right now — retry later.')
}

/** An EMPTY project (marker only) — exercises the new-project playbook. */
export const createEmptyLiveProject = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-live-empty-'))
  fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.wordbird', 'project.json'),
    JSON.stringify({ name: 'Fresh', flavor: 'chapters-scenes' }),
    'utf8'
  )
  return root
}

/** A small but real novel project: two scenes, a bible page, the marker. */
export const createLiveProject = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-live-'))
  const write = (relative: string, content: string): void => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }
  write('.wordbird/project.json', JSON.stringify({ name: 'Live', flavor: 'chapters-scenes' }))
  write(
    'manuscript/chapter-one/opening.md',
    'Detective Zara Voss stepped into the rain-slick alley, her grey eyes scanning the dark.\n'
  )
  write(
    'manuscript/chapter-one/the-letter.md',
    'The letter on her desk named a house in Amityville, and a room no blueprint showed.\n'
  )
  write(
    'bible/characters/zara.md',
    '---\naliases: [Zara, Detective Voss]\n---\n# Zara Voss\n\nEyes: grey. Age: 34. A skeptic.\n'
  )
  return root
}

export interface LiveHarness {
  root: string
  provider: LiveProvider
  /** Present only on the openrouter backend. */
  orchestrator?: Orchestrator
  editProposals: unknown[]
  planProposals: Array<{ id: string; title: string; path: string; content: string }>
  approvals: IAgentApprovalRequest[]
  writerQuestions: Array<{ question: string; options: Array<{ label: string }> }>
  activity: IAgentActivityEvent[]
  agentStatuses: IAgentStatus[]
  contextUsages: IContextUsage[]
  /** Latest session token tally (both backends emit it). */
  tokenUsage: () => ITokenTally
  send: (threadId: string, text: string) => Promise<string>
  setMode: (mode: AgentPermissionMode) => void
  /** Queue a mid-run steering note (drained at supervisor boundaries —
   * same delivery contract as the app's Steer button). */
  queueSteering: (note: string) => void
  dispose: () => void
}

const emptyTally = (): ITokenTally => ({ inputTokens: 0, outputTokens: 0, calls: 0, byRole: {} })

export const createHarness = async(options?: {
  approve?: (request: IAgentApprovalRequest) => boolean
  root?: string
  /** Names this harness in the LIVE TOKEN REPORT. */
  label?: string
  /** Per-invoke turn cap — the token-thrift guard (subscription only
   * honors it via AgentSDKRunner.turnBudget; openrouter caps supersteps). */
  turnBudget?: number
}): Promise<LiveHarness> => {
  if (!liveProvider) throw new Error(`No live provider: ${liveSelection.reason}`)
  const root = options?.root ?? createLiveProject()

  const service = new AgentToolService()
  // Registers ALL packs (built-in internally chains novel + web).
  registerBuiltInAgentToolHandlers(service)
  const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
  const pack = await loader.loadPack(path.resolve(__dirname, '../../static/agentTools.json'))
  service.loadToolPack(pack)
  service.setProjectRoot(root)

  // Production parity: the turn research ledger records/serves at the
  // choke point and feeds GATHERED THIS TURN, exactly like the app.
  const ledger = new ResearchLedger()
  service.setResearchLedger(ledger)

  // Production parity: the research-save BACKSTOP (LangGraphManager L2).
  // Live-run forensics (2026-07-18, subscription): a supervisor that
  // researches directly can answer with citations and end the turn
  // without save_research — in the app the backstop then forces the
  // save; a harness without it tests a stack the app never runs.
  // (driveCoherencePass is deliberately NOT ported: it multiplies turns
  // on write-heavy flows — token cost — and its machinery is fully
  // unit-pinned in coherence-pass.spec.)
  let turnObservations: TurnObservations = emptyObservations()
  service.setToolRunObserver(({ toolName }) => {
    observeResearchTool(turnObservations, toolName)
  })

  const editProposals: unknown[] = []
  const planProposals: LiveHarness['planProposals'] = []
  const writerQuestions: Array<{ question: string; options: Array<{ label: string }> }> = []
  service.setEditProposalEmitter((proposal) => {
    editProposals.push(proposal)
  })
  service.setPlanProposalEmitter(({ planProposal }) => {
    planProposals.push(planProposal)
  })
  service.setWriterQuestionEmitter(({ writerQuestion }) => {
    writerQuestions.push(writerQuestion)
  })

  const approvals: IAgentApprovalRequest[] = []
  const activity: IAgentActivityEvent[] = []
  const agentStatuses: IAgentStatus[] = []
  const contextUsages: IContextUsage[] = []
  const steeringQueue: string[] = []
  let sessionTally: ITokenTally = emptyTally()

  const callbacks: OrchestratorCallbacks = {
    emitActivity: (event) => {
      activity.push(event)
    },
    requestApproval: async(request) => {
      approvals.push(request)
      return options?.approve ? options.approve(request) : true
    },
    buildBrief: () => contextBuilder.buildProjectBrief(root),
    emitAgentStatus: (status) => {
      agentStatuses.push(status)
    },
    emitContextUsage: (usage) => {
      contextUsages.push(usage)
    },
    emitTokenUsage: (update) => {
      sessionTally = update.session
    },
    // Scene handoff + research ledger — same wiring LangGraphManager uses.
    buildHandoff: (task) => contextBuilder.buildSceneHandoff(root, task),
    buildGathered: () => ledger.renderSection(),
    drainSteering: () => steeringQueue.splice(0)
  }

  let orchestrator: Orchestrator | undefined
  let invokeTurn: (threadId: string, text: string) => Promise<string>
  let setMode: (mode: AgentPermissionMode) => void

  if (liveProvider === 'subscription') {
    const runner = new AgentSDKRunner({
      config: {
        provider: 'claude-code',
        apiKey: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
        // sonnet, never opus — every turn bills the writer's plan.
        model: process.env.LIVE_CLAUDE_MODEL || 'sonnet'
      },
      callbacks,
      toolService: service,
      stateDir: path.join(root, '.wordbird', 'agent-state'),
      projectRoot: () => root,
      turnBudget: options?.turnBudget ?? 24,
      subagentModel: process.env.LIVE_SUBAGENT_MODEL || undefined
    })
    setMode = (mode) => runner.setMode(mode)
    invokeTurn = async(threadId, text) => {
      const graph = runner.buildGraph()
      const result = await graph.invoke(
        { messages: [{ content: text }] },
        { configurable: { thread_id: threadId } }
      )
      return result.messages[0]?.content ?? ''
    }
  } else {
    await resolveModel()
    orchestrator = new Orchestrator({
      modelFactory: () =>
        new ChatOpenAI({
          apiKey: apiKey(),
          model: activeModel(),
          temperature: 0,
          // Reasoning models (gpt-oss & friends) spend completion budget on
          // hidden thinking BEFORE emitting content or tool calls — a small
          // cap yields empty replies with zero tool calls.
          maxTokens: 8192,
          maxRetries: 5,
          configuration: { baseURL: OPENROUTER_BASE_URL }
        }) as never,
      tools: service.getLangChainTools(),
      callbacks,
      checkpointer: new MemorySaver()
    })
    const bound = orchestrator
    invokeTurn = async(threadId, text) => {
      const graph = bound.buildGraph() as unknown as {
        invoke: (
          state: { messages: BaseMessage[] },
          config: unknown
        ) => Promise<{ messages: BaseMessage[] }>
      }
      const result = await graph.invoke(
        { messages: [new HumanMessage(text)] },
        {
          configurable: { thread_id: threadId },
          recursionLimit: options?.turnBudget ?? bound.recursionLimit()
        }
      )
      const last = result.messages[result.messages.length - 1]
      return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
    }
    setMode = (mode) => bound.setMode(mode)
  }

  // The app's post-turn enforcement: research done this turn must not
  // evaporate — one bounded follow-up demands the save (all modes).
  const withBackstop = async(threadId: string, reply: string): Promise<string> => {
    const researchReply = await driveResearchBackstop(turnObservations, {
      invokeNext: (instruction) => invokeTurn(threadId, instruction),
      emitStatus: () => {}
    })
    return researchReply ? `${reply}\n\n${researchReply}` : reply
  }

  const send = async(threadId: string, text: string): Promise<string> => {
    // Per writer turn, exactly like LangGraphManager.sendMessage — incl.
    // seeding the turn so Codex-style bible auto-injection + freshness
    // fire (the manager passes the writer's message as the lore seed).
    ledger.reset()
    service.resetTurnCallCounts()
    turnObservations = emptyObservations()
    contextBuilder.beginTurn(root, text)
    if (liveProvider === 'subscription') {
      return await withBackstop(threadId, await invokeTurn(threadId, text))
    }
    try {
      const activityBefore = activity.length
      const reply = await invokeTurn(threadId, text)
      // A collapsing free model can emit degenerate token garbage
      // (<unk><unk>…) — that's pool failure too, not a product signal.
      if ((reply.match(/<unk>/g) ?? []).length >= 3) {
        const next = await failoverModel()

        console.info(`[live-e2e] degenerate output — failing over to ${next}`)
        return await withBackstop(threadId, await invokeTurn(threadId, text))
      }
      // A degraded free pool can also return empty 200s: no content, no
      // tool calls. Treat that like exhaustion and fail over once.
      if (!reply.trim() && activity.length === activityBefore) {
        const next = await failoverModel()

        console.info(`[live-e2e] empty reply from degraded pool — failing over to ${next}`)
        return await withBackstop(threadId, await invokeTurn(threadId, text))
      }
      return await withBackstop(threadId, reply)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // A free pool can flicker out AFTER a clean probe. Interrupted-run
      // repair (housekeeping) makes the retried thread provider-legal, so
      // fail over to a different live model and retry the turn once.
      // 403 "prompt injection patterns detected" is an upstream moderation
      // false-positive some free providers bolt on — same treatment.
      if (/429|rate.?limit|provider returned error|prompt injection|\b403\b/i.test(message)) {
        const next = await failoverModel()

        console.info(`[live-e2e] pool exhausted mid-run — failing over to ${next}`)
        return await withBackstop(threadId, await invokeTurn(threadId, text))
      }
      throw error
    }
  }

  const harness: LiveHarness = {
    root,
    provider: liveProvider,
    orchestrator,
    editProposals,
    planProposals,
    approvals,
    writerQuestions,
    activity,
    agentStatuses,
    contextUsages,
    tokenUsage: () => sessionTally,
    send,
    setMode,
    queueSteering: (note) => {
      steeringQueue.push(note)
    },
    dispose: () => {
      if (process.env.LIVE_KEEP_ARTIFACTS === '1') {
        // Post-mortem mode: keep the project, dump what the run saw.
        const artifactsDir = path.join(root, '.live-artifacts')
        fs.mkdirSync(artifactsDir, { recursive: true })
        fs.writeFileSync(
          path.join(artifactsDir, 'activity.json'),
          JSON.stringify(
            { provider: liveProvider, activity, agentStatuses, approvals, tokens: sessionTally },
            null,
            2
          )
        )

        console.info(`[live] artifacts kept at ${root}`)
        return
      }
      fs.rmSync(root, { recursive: true, force: true })
    }
  }
  tokenRegistry.push({
    label: options?.label ?? path.basename(root),
    tally: () => sessionTally
  })
  return harness
}

/** Free-tier pacing: a short breather between tests avoids 429 storms. */
export const breathe = (ms = 4000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
