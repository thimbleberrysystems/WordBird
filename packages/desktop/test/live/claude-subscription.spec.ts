/**
 * Live check of the claude-code provider: the REAL Agent SDK runtime,
 * authenticated with a Claude subscription. Self-skips without
 * CLAUDE_CODE_OAUTH_TOKEN (generate one with `claude setup-token`) — the
 * nightly OpenRouter suite stays independent of it.
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
  editProposals: Array<{ edit: { filePath: string; newContent: string } }>
  send: (threadId: string, text: string) => Promise<string>
}

const roots: string[] = []

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
  const editProposals: SubHarness['editProposals'] = []
  service.setEditProposalEmitter((proposal) => {
    editProposals.push(proposal as never)
  })
  const callbacks: OrchestratorCallbacks = {
    emitActivity: (event) => activity.push(event),
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

afterAll(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

live('claude-code provider (Claude subscription via Agent SDK)', () => {
  it('probe validates the subscription end to end', async() => {
    const harness = await makeHarness()
    await expect(harness.runner.probe()).resolves.toBeUndefined()
  })

  it('answers a bible fact through the bridged read tools', async() => {
    const harness = await makeHarness()
    harness.runner.setMode('ask')
    const reply = await harness.send(
      't-sub-ground',
      'Check the story bible: what colour are Zara Voss’s eyes? One word answer.'
    )
    expect(reply).toMatch(/grey|gray/i)
    // The answer must come from the project, not memory: a WordBird tool ran.
    expect(harness.activity.some((event) => event.kind === 'tool')).toBe(true)
    // Ask mode is mechanically read-only.
    expect(harness.editProposals).toHaveLength(0)
  })

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

  it('surgical edits arrive as review-queue proposals, never direct writes', async() => {
    const harness = await makeHarness()
    harness.runner.setMode('approvals')
    const original = fs.readFileSync(
      path.join(harness.root, 'manuscript/chapter-one/opening.md'),
      'utf8'
    )
    await harness.send(
      't-sub-edit',
      'In the opening scene, change the word "waited" to "lingered" using a surgical ' +
        'text edit. One word only — do not rewrite the file.'
    )
    expect(harness.editProposals.length).toBeGreaterThanOrEqual(1)
    expect(harness.editProposals[0].edit.newContent).toContain('lingered')
    // Approvals mode: the file itself is untouched until the writer accepts.
    const after = fs.readFileSync(
      path.join(harness.root, 'manuscript/chapter-one/opening.md'),
      'utf8'
    )
    expect(after).toBe(original)
  })
})
