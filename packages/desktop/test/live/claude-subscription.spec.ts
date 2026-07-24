/**
 * SDK-SPECIFIC live pins for the claude-code provider: the REAL Agent
 * SDK runtime, authenticated with a Claude subscription. Self-skips
 * without CLAUDE_CODE_OAUTH_TOKEN (`claude setup-token`) or a local
 * Claude Code login — the nightly OpenRouter suite stays independent.
 *
 * SCOPE: only what cannot be covered by the provider-parameterized
 * shared suite (live-e2e.spec.ts, which runs ALL writer flows on this
 * same runtime when the subscription is the selected provider): the
 * connect probe, session-resume tool-server survival, the raw-SDK #114
 * parallel race, the max-turns result-shape pin, and the production-
 * runner permission-storm wave. Writer-flow coverage lives in the
 * shared suite — do not add flows here.
 *
 *   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-… pnpm run test:live
 *
 * NOTE: these turns bill the subscription's plan limits.
 */

import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { homedir } from 'os'
import { AgentSDKRunner } from '../../src/main/services/ai/agentSdk/AgentSDKRunner'
import {
  AgentToolService,
  AgentToolPackLoader
} from '../../src/main/services/ai/AgentToolService'
import { registerBuiltInAgentToolHandlers } from '../../src/main/services/ai/AgentToolHandlers'
import { registerNovelAgentToolHandlers } from '../../src/main/services/ai/NovelToolHandlers'
import { registerWebAgentToolHandlers } from '../../src/main/services/ai/WebToolHandlers'
import type { OrchestratorCallbacks } from '../../src/main/services/ai/orchestrator/Orchestrator'
import type { IAgentActivityEvent } from '../../src/shared/types/langgraph'

const TOKEN = (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '').trim()
// A local Claude Code login works too — exactly the provider's auto-detect
// path. CI has neither and skips; a logged-in dev machine runs live.
const hasLocalLogin = fs.existsSync(path.join(homedir(), '.claude', '.credentials.json'))
const live = describe.skipIf(!TOKEN && !hasLocalLogin)

interface SubHarness {
  runner: AgentSDKRunner
  root: string
  activity: IAgentActivityEvent[]
  statuses: Array<{ role: string; status: string }>
  editProposals: Array<{ edit: { filePath: string; newContent: string } }>
  send: (threadId: string, text: string) => Promise<string>
}

const roots: string[] = []

interface FastProbeServer {
  url: string
  close: () => Promise<void>
}
const reproServers: FastProbeServer[] = []

/**
 * A minimal loopback streamable-HTTP MCP server exposing `count` fast,
 * no-arg probe tools (probe_i → `token_i: OK`). This is the SAME transport
 * KIND production ships (httpMcpServer.ts, `type: 'http'`) — the escape hatch
 * WordBird uses to route around the SDK's in-process #114 deferral race. The
 * session routing mirrors buildWordbirdHttpMcpServer: an initialize (no
 * session header) mints a fresh transport; later requests route by
 * mcp-session-id (a shared transport answers exactly one initialize).
 */
const startFastProbeHttpMcp = async(count: number): Promise<FastProbeServer> => {
  const http = (await import('http')).default
  const { randomUUID } = await import('crypto')
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  )

  const buildMcp = (): InstanceType<typeof McpServer> => {
    const mcp = new McpServer({ name: 'repro', version: '1.0.0' })
    for (let i = 0; i < count; i++) {
      const idx = i
      mcp.registerTool(
        `probe_${idx}`,
        { description: `Fast probe ${idx}: returns a token instantly.`, inputSchema: {} },
        (async() => ({ content: [{ type: 'text', text: `token_${idx}: OK` }] })) as never
      )
    }
    return mcp
  }

  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>()
  const server = http.createServer(async(req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      const existing = sessionId ? sessions.get(sessionId) : undefined
      if (existing) {
        await existing.handleRequest(req, res)
        return
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string): void => {
          sessions.set(sid, transport)
        }
      })
      transport.onclose = (): void => {
        if (transport.sessionId) sessions.delete(transport.sessionId)
      }
      await buildMcp().connect(transport)
      await transport.handleRequest(req, res)
    } catch {
      if (!res.headersSent) res.writeHead(500).end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: async() => {
      for (const transport of sessions.values()) {
        try {
          await transport.close?.()
        } catch {
          /* already closed */
        }
      }
      sessions.clear()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

const makeHarness = async(): Promise<SubHarness> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-sub-live-'))
  roots.push(root)
  const write = (rel: string, content: string): void => {
    const target = path.join(root, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  write('.wordbird/project.json', JSON.stringify({ name: 'Live', flavor: 'chapters-scenes' }))
  write(
    'manuscript/chapter-one/opening.md',
    'Zara Voss waited on the jetty while the lighthouse turned.\n'
  )
  write(
    'bible/characters/zara-voss.md',
    '---\naliases: [Zara]\n---\n\n# Zara Voss\n\nEyes: grey. Occupation: lighthouse keeper.\n'
  )

  const service = new AgentToolService()
  registerBuiltInAgentToolHandlers(service)
  registerNovelAgentToolHandlers(service)
  registerWebAgentToolHandlers(service)
  const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
  service.loadToolPack(await loader.loadPack(path.join(__dirname, '../../static/agentTools.json')))
  service.setProjectRoot(root)

  const activity: IAgentActivityEvent[] = []
  const statuses: SubHarness['statuses'] = []
  const editProposals: SubHarness['editProposals'] = []
  service.setEditProposalEmitter((proposal) => {
    editProposals.push(proposal as never)
  })
  const callbacks: OrchestratorCallbacks = {
    emitActivity: (event) => activity.push(event),
    emitAgentStatus: (status) => statuses.push({ role: status.role, status: status.status }),
    requestApproval: async() => true,
    buildBrief: async() =>
      'PROJECT BRIEF: gothic novella. Manuscript: chapter-one/opening.md. ' +
      'Bible: characters/zara-voss.md.'
  }

  const runner = new AgentSDKRunner({
    config: { provider: 'claude-code', apiKey: TOKEN, model: 'sonnet' },
    callbacks,
    toolService: service,
    stateDir: path.join(root, '.wordbird', 'agent-state'),
    projectRoot: () => root
  })

  return {
    runner,
    root,
    activity,
    statuses,
    editProposals,
    send: async(threadId, text) => {
      const graph = runner.buildGraph()
      const response = await graph.invoke(
        { messages: [{ content: text }] },
        { configurable: { thread_id: threadId } }
      )
      return response.messages[0]?.content ?? ''
    }
  }
}

afterAll(async() => {
  for (const probe of reproServers.splice(0)) {
    try {
      await probe.close()
    } catch {
      /* already closed */
    }
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

live('claude-code provider (Claude subscription via Agent SDK)', () => {
  it('probe validates the subscription end to end', async() => {
    const harness = await makeHarness()
    await expect(harness.runner.probe()).resolves.toBeUndefined()
  })

  it('STOP MEANS STOP: aborting mid-run ends activity promptly', async() => {
    // Live pin for the 2026-07-18 incident: Stop interrupted the model
    // loop but queued in-process tool calls (web retries included) kept
    // churning — the writer watched activity that would not die. Cost:
    // one short aborted turn (~2-4 model calls).
    const harness = await makeHarness()
    harness.runner.setMode('ask')
    const controller = new AbortController()
    const graph = harness.runner.buildGraph()
    const pending = graph
      .invoke(
        {
          messages: [
            {
              content:
                'Research the full history of lighthouse construction: search and read at ' +
                'least six different sources one after another, summarizing each.'
            }
          ]
        },
        { configurable: { thread_id: 't-stop' }, signal: controller.signal }
      )
      .catch(() => ({ messages: [{ content: '' }] }))

    // Let the run actually start working, then hit Stop.
    await expect
      .poll(() => harness.activity.length, { timeout: 120_000 })
      .toBeGreaterThan(0)
    controller.abort()

    // The invoke ends promptly (not after six sources' worth of work)…
    const abortedAt = Date.now()
    await pending
    expect(Date.now() - abortedAt).toBeLessThan(30_000)

    // …and the activity feed goes QUIET: no new events trail in after
    // the stop settles (post-abort emission is suppressed).
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    const settled = harness.activity.length
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    expect(harness.activity.length).toBe(settled)
  }, 300_000)

  it('resumed sessions keep the tool server alive (multi-turn on one thread)', async() => {
    // Every real conversation after its first message rides `resume` — a
    // stored SDK session id. The in-process MCP server must survive that
    // path: a regression here surfaces as "Stream closed" on EVERY
    // mcp__wordbird__ call while plain text keeps streaming.
    const harness = await makeHarness()
    harness.runner.setMode('ask')
    const first = await harness.send(
      't-sub-resume',
      'Check the story bible: what colour are Zara Voss’s eyes? One word answer.'
    )
    expect(first).toMatch(/grey|gray/i)
    const toolsAfterFirst = harness.activity.filter((event) => event.kind === 'tool').length
    expect(toolsAfterFirst).toBeGreaterThanOrEqual(1)

    const second = await harness.send(
      't-sub-resume',
      'Same bible page: what is Zara Voss’s occupation? Answer in a few words, ' +
        'and read the page again rather than trusting memory.'
    )
    expect(second).toMatch(/lighthouse/i)
    expect(second).not.toMatch(/stream closed|unreachable|tool server/i)
    // The second turn must have executed a real tool call too.
    const toolsAfterSecond = harness.activity.filter((event) => event.kind === 'tool').length
    expect(toolsAfterSecond).toBeGreaterThan(toolsAfterFirst)
  })

  it('parallel subagents keep in-process tool calls alive (SDK #114 regression)', async() => {
    // agent-sdk <=0.3.207 raced on concurrent subagent MCP calls: once any
    // in-flight call outlived ~5s, EVERY later mcp__* call in those agents
    // failed with "Stream closed" — a WordBird worker wave in miniature.
    // Fixed in 0.3.211; this drives sdk.query directly to pin the fix.
    const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as unknown as {
      query: (args: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<unknown>
      tool: (name: string, description: string, schema: unknown, handler: unknown) => unknown
      createSdkMcpServer: (options: { name: string; tools: unknown[] }) => unknown
    }
    const fastProbe = sdk.tool('fast_probe', 'Returns the magic word instantly.', {}, async() => ({
      content: [{ type: 'text', text: 'magic word: TANGERINE' }]
    }))
    const slowWait = sdk.tool('slow_wait', 'Waits 8s then returns a token.', {}, async() => {
      await new Promise((resolve) => setTimeout(resolve, 8000))
      return { content: [{ type: 'text', text: 'slow token: PERSIMMON' }] }
    })
    const env: Record<string, string | undefined> = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN
    if (TOKEN) env.CLAUDE_CODE_OAUTH_TOKEN = TOKEN

    const toolResults: string[] = []
    const stream = sdk.query({
      prompt:
        'Spawn three "checker" subagents IN PARALLEL (one message, three Task invocations). ' +
        'Each checker must call slow_wait, then fast_probe, and report both outputs. ' +
        'Then summarize which calls failed.',
      options: {
        env,
        model: 'haiku',
        cwd: os.tmpdir(),
        settingSources: [],
        maxTurns: 30,
        permissionMode: 'default',
        mcpServers: {
          repro: sdk.createSdkMcpServer({ name: 'repro', tools: [fastProbe, slowWait] })
        },
        agents: {
          checker: {
            description: 'Calls repro tools and reports results.',
            prompt: 'You verify tools. Call exactly what the task says, report outputs tersely.',
            tools: ['mcp__repro__fast_probe', 'mcp__repro__slow_wait'],
            model: 'haiku'
          }
        },
        allowedTools: ['Task', 'mcp__repro__fast_probe', 'mcp__repro__slow_wait']
      }
    })
    for await (const raw of stream) {
      const message = raw as {
        type?: string
        message?: { content?: Array<{ type?: string; content?: unknown }> }
      }
      if (message.type === 'user' && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) {
          if (block.type === 'tool_result') toolResults.push(JSON.stringify(block.content))
        }
      }
    }
    // The race needs real concurrency to show; require enough calls ran.
    expect(toolResults.length).toBeGreaterThanOrEqual(4)
    const closed = toolResults.filter((text) => /stream closed/i.test(text))
    expect(closed).toEqual([])
  }, 600000)

  it('many-tool HTTP transport: a subagent making several fast calls never gets "no output"', async() => {
    // prj13 wedge (2026-07-19): with ~57 tools the SDK defers them behind tool
    // search; a deferred tool a SUBAGENT then invokes came back
    // tool_deferred_unavailable → "completed with no output", after which every
    // later call went instant-empty with NO stream-closed error.
    //
    // UPSTREAM REALITY (#114, still not fully fixed through 0.3.215): the SDK's
    // IN-PROCESS transport (createSdkMcpServer) drops a subagent's rapid calls
    // even with alwaysLoad:true — a real limitation we do NOT try to assert
    // away here (that earlier assertion flaked because the in-process race is
    // genuinely present). WordBird PRODUCTION routes around it entirely by
    // serving the tool pack over a loopback STREAMABLE-HTTP MCP server
    // (httpMcpServer.ts) — HTTP delivers what the in-process transport drops.
    //
    // So this pin verifies the WORKAROUND at exactly the boundary production
    // depends on: over the same transport KIND WordBird ships (`type: 'http'`
    // + alwaysLoad), a subagent's five fast SEQUENTIAL calls to a MANY-tool
    // server (past the deferral threshold) all return real content. If this
    // ever fails, the HTTP escape hatch itself has regressed — not merely the
    // upstream in-process race. Single live run (TOKEN THRIFT): the in-process
    // failure mode is documented above, not re-exercised.
    const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as unknown as {
      query: (args: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<unknown>
    }
    // 40 fast tools → comfortably past the tool-search deferral threshold,
    // served over loopback HTTP exactly as production serves the real pack.
    const probe = await startFastProbeHttpMcp(40)
    reproServers.push(probe)

    const env: Record<string, string | undefined> = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN
    if (TOKEN) env.CLAUDE_CODE_OAUTH_TOKEN = TOKEN

    const toolResults: string[] = []
    const stream = sdk.query({
      prompt:
        'Spawn ONE "checker" subagent. It must call probe_0, probe_1, probe_2, probe_3, ' +
        'and probe_4 IN SEQUENCE (five separate calls) and report each returned token.',
      options: {
        env,
        model: 'haiku',
        cwd: os.tmpdir(),
        settingSources: [],
        maxTurns: 30,
        permissionMode: 'default',
        mcpServers: {
          repro: { type: 'http', url: probe.url, alwaysLoad: true }
        },
        agents: {
          checker: {
            description: 'Calls probe tools in sequence and reports each result.',
            prompt: 'You verify tools. Call exactly what the task says; report each token.',
            tools: Array.from({ length: 40 }, (_u, i) => `mcp__repro__probe_${i}`),
            model: 'haiku'
          }
        },
        allowedTools: [
          'Task',
          ...Array.from({ length: 40 }, (_u, i) => `mcp__repro__probe_${i}`)
        ]
      }
    })
    for await (const raw of stream) {
      const message = raw as {
        type?: string
        message?: { content?: Array<{ type?: string; content?: unknown }> }
      }
      if (message.type === 'user' && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) {
          if (block.type === 'tool_result') toolResults.push(JSON.stringify(block.content))
        }
      }
    }
    // At least the five sequential subagent calls ran.
    expect(toolResults.length).toBeGreaterThanOrEqual(5)
    // NONE came back as the SDK's empty-result placeholder — over HTTP, the
    // production transport, this must hold (the in-process race is routed around).
    const empties = toolResults.filter((text) => /no output/i.test(text))
    expect(
      empties,
      `HTTP transport returned empty tool results: ${empties.length}/${toolResults.length}`
    ).toEqual([])
    // And the real token payloads actually arrived.
    expect(toolResults.some((text) => /token_\d+: OK/.test(text))).toBe(true)
  }, 600000)

  it('REAL RUNNER research turn: tools keep answering, research persists (empty-tools regression)', async() => {
    // THE prj13 wedge, through the PRODUCTION path (AgentSDKRunner + the real
    // 57-tool server + resume) — the raw-sdk.query pins above cannot exercise
    // it. Symptom was: after a handful of calls the IN-PROCESS MCP transport
    // stopped delivering results, the model saw "completed with no output",
    // reported a "live outage", and saved nothing (upstream #108 / #43642).
    // FIXED by serving the tools over a loopback HTTP MCP server
    // (httpMcpServer.ts) — HTTP delivers what the in-process transport drops.
    // This guards both halves of the contract: a real note lands on disk, and
    // the model never cries outage. WORDBIRD_TOOL_DEBUG=1 prints per-tool
    // delivery ([tooldbg] <tool> -> <n> chars) when diagnosing a regression.
    const prev = process.env.WORDBIRD_TOOL_DEBUG
    process.env.WORDBIRD_TOOL_DEBUG = '1'
    try {
      const harness = await makeHarness()
      harness.runner.setMode('auto')
      const r1 = await harness.send(
        't-empty-tools',
        'My novel is set in ancient Elam. Research its history, geography, and religion ' +
          'from online sources and save your findings for future reference.'
      )
      // Second turn rides `resume` — the path every real conversation takes.
      const r2 = await harness.send(
        't-empty-tools',
        'Good — now also research the Elamite language and save that too.'
      )

      // 1) Research actually persisted (recursively, any subfolder).
      const researchDir = path.join(harness.root, 'bible', 'research')
      const landed =
        fs.existsSync(researchDir) &&
        fs
          .readdirSync(researchDir, { recursive: true } as never)
          .some((f) => String(f).endsWith('.md'))
      expect(landed, 'no research note persisted to disk').toBe(true)

      // 2) The model never reported a tool outage (the empty-tools tell).
      const outage = /(intermitten|not working|dead connection|live outage|returning empty|tools.*(flaky|failing))/i
      expect(
        outage.test(`${r1}\n${r2}`),
        'model reported a tool outage — empty-tools wedge reproduced'
      ).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.WORDBIRD_TOOL_DEBUG
      else process.env.WORDBIRD_TOOL_DEBUG = prev
    }
  }, 600000)

  it('the real runtime reports max-turns as error_max_turns (budget-path pin)', async() => {
    // AgentSDKRunner maps subtype 'error_max_turns' onto the graceful
    // GraphRecursionError budget path (scripted pin in
    // agent-sdk-runner.spec.ts). This proves the real runtime still emits
    // that subtype. Subagent-brief injection is likewise pinned scripted
    // (buildSdkAgents test) per the live-suite policy carve-out.
    const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as unknown as {
      query: (args: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<unknown>
      tool: (name: string, description: string, schema: unknown, handler: unknown) => unknown
      createSdkMcpServer: (options: { name: string; tools: unknown[] }) => unknown
    }
    const slowProbe = sdk.tool('probe_step', 'Returns one step of a chain.', {}, async() => ({
      content: [{ type: 'text', text: 'step done — call probe_step again for the next step' }]
    }))
    const env: Record<string, string | undefined> = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN
    if (TOKEN) env.CLAUDE_CODE_OAUTH_TOKEN = TOKEN

    let resultSubtype = ''
    let thrownMessage = ''
    const stream = sdk.query({
      prompt: 'Call probe_step four times in sequence, one at a time, then summarize.',
      options: {
        env,
        model: 'haiku',
        cwd: os.tmpdir(),
        settingSources: [],
        maxTurns: 1,
        permissionMode: 'default',
        mcpServers: { probe: sdk.createSdkMcpServer({ name: 'probe', tools: [slowProbe] }) },
        allowedTools: ['mcp__probe__probe_step']
      }
    })
    try {
      for await (const raw of stream) {
        const message = raw as { type?: string; subtype?: string }
        if (message.type === 'result') resultSubtype = String(message.subtype ?? '')
      }
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error)
    }
    // The runtime reports max-turns in one of two shapes — a yielded result
    // with subtype error_max_turns, or a throw naming the turn limit. The
    // runner handles BOTH; this pin fails if the runtime invents a third.
    const yielded = resultSubtype === 'error_max_turns'
    const thrown = /maximum number of turns/i.test(thrownMessage)
    expect(yielded || thrown, `subtype=${resultSubtype} thrown=${thrownMessage}`).toBe(true)
  }, 300000)

  it('REAL-RUNNER parallel wave: no permission-stream failures, spawns detected', async() => {
    // THE LESSON of the prj7 incident (2026-07-18, 46/64 calls failed
    // 'Tool permission request failed: AbortError: Stream closed'): tests
    // that hand-roll SDK options can't catch configuration bugs. This one
    // drives the PRODUCTION AgentSDKRunner — its real allowedTools,
    // buildSdkAgents, canUseTool — through a parallel researcher wave
    // hammering in-process mcp tools.
    const harness = await makeHarness()
    harness.runner.setMode('ask')
    const reply = await harness.send(
      't-wave',
      'Spawn TWO researcher agents IN PARALLEL (one message, two spawn invocations): ' +
        'one researches "history of lighthouse keeping", the other "history of sea ' +
        'shanties". Each should do a few wiki lookups. Then summarize both reports in ' +
        'two sentences.'
    )
    expect(reply.length).toBeGreaterThan(20)
    // Spawns were detected under the runtime's CURRENT spawn-tool name.
    expect(harness.statuses.some((s) => s.role === 'researcher')).toBe(true)
    // ZERO permission-stream failures anywhere in the activity feed.
    const failures = harness.activity.filter((event) =>
      /permission request failed|stream closed/i.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(failures).toEqual([])
  }, 600000)
})
