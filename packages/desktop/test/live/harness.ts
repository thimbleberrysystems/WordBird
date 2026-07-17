/**
 * Live E2E harness: the REAL Biscuit stack — Orchestrator, the full
 * agentTools.json pack, real tool handlers over a scratch novel project —
 * driven by a REAL model through OpenRouter.
 *
 * Environment:
 *   OPENROUTER_KEY    (required — suite skips without it; also accepts
 *                      OPENROUTER_API_KEY)
 *   OPENROUTER_MODEL  (optional — a concrete model id, or the sentinel
 *                      "openrouter/free" / unset to auto-pick a free
 *                      tool-calling model from the live catalog)
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
import { AgentToolService, AgentToolPackLoader } from '../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../src/main/services/ai/AgentToolHandlers'
import { contextBuilder } from '../../src/main/services/ai/ContextBuilder'
import type {
  AgentPermissionMode,
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IAgentStatus,
  IContextUsage
} from '../../src/shared/types/langgraph'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const apiKey = (): string =>
  process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || ''

export const hasKey = (): boolean => apiKey().length > 0

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
  orchestrator: Orchestrator
  editProposals: unknown[]
  planProposals: Array<{ id: string; title: string; path: string; content: string }>
  approvals: IAgentApprovalRequest[]
  writerQuestions: Array<{ question: string; options: Array<{ label: string }> }>
  activity: IAgentActivityEvent[]
  agentStatuses: IAgentStatus[]
  contextUsages: IContextUsage[]
  send: (threadId: string, text: string) => Promise<string>
  setMode: (mode: AgentPermissionMode) => void
  dispose: () => void
}

export const createHarness = async(options?: {
  approve?: (request: IAgentApprovalRequest) => boolean
  root?: string
}): Promise<LiveHarness> => {
  const root = options?.root ?? createLiveProject()
  await resolveModel()

  const service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
  const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
  const pack = await loader.loadPack(path.resolve(__dirname, '../../static/agentTools.json'))
  service.loadToolPack(pack)
  service.setProjectRoot(root)

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

  const orchestrator = new Orchestrator({
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
    callbacks: {
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
      // Scene handoff (P0.2) — same wiring LangGraphManager uses.
      buildHandoff: (task) => contextBuilder.buildSceneHandoff(root, task)
    },
    checkpointer: new MemorySaver()
  })

  const invokeTurn = async(threadId: string, text: string): Promise<string> => {
    const graph = orchestrator.buildGraph() as unknown as {
      invoke: (
        state: { messages: BaseMessage[] },
        config: unknown
      ) => Promise<{ messages: BaseMessage[] }>
    }
    const result = await graph.invoke(
      { messages: [new HumanMessage(text)] },
      {
        configurable: { thread_id: threadId },
        recursionLimit: orchestrator.recursionLimit()
      }
    )
    const last = result.messages[result.messages.length - 1]
    return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
  }

  const send = async(threadId: string, text: string): Promise<string> => {
    try {
      const activityBefore = activity.length
      const reply = await invokeTurn(threadId, text)
      // A collapsing free model can emit degenerate token garbage
      // (<unk><unk>…) — that's pool failure too, not a product signal.
      if ((reply.match(/<unk>/g) ?? []).length >= 3) {
        const next = await failoverModel()

        console.info(`[live-e2e] degenerate output — failing over to ${next}`)
        return await invokeTurn(threadId, text)
      }
      // A degraded free pool can also return empty 200s: no content, no
      // tool calls. Treat that like exhaustion and fail over once.
      if (!reply.trim() && activity.length === activityBefore) {
        const next = await failoverModel()

        console.info(`[live-e2e] empty reply from degraded pool — failing over to ${next}`)
        return await invokeTurn(threadId, text)
      }
      return reply
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
        return await invokeTurn(threadId, text)
      }
      throw error
    }
  }

  return {
    root,
    orchestrator,
    editProposals,
    planProposals,
    approvals,
    writerQuestions,
    activity,
    agentStatuses,
    contextUsages,
    send,
    setMode: (mode) => orchestrator.setMode(mode),
    dispose: () => fs.rmSync(root, { recursive: true, force: true })
  }
}

/** Free-tier pacing: a short breather between tests avoids 429 storms. */
export const breathe = (ms = 4000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
