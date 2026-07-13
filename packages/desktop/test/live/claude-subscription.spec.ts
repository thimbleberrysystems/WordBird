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
