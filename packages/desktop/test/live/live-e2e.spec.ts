/**
 * Live end-to-end suite: every core Biscuit flow against a REAL model on
 * OpenRouter (free tier). Skipped entirely without OPENROUTER_KEY.
 *
 *   OPENROUTER_KEY=sk-or-… pnpm run test:live
 *
 * These tests assert BEHAVIOR (files proposed, plans saved, approvals
 * requested, facts grounded in the project) — not exact wording, so they
 * tolerate model variation. Runs sequentially with pacing for free-tier
 * rate limits.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  hasKey,
  resolveModel,
  createHarness,
  createEmptyLiveProject,
  breathe,
  type LiveHarness
} from './harness'

const live = describe.skipIf(!hasKey())

const harnesses: LiveHarness[] = []
const make = async(options?: Parameters<typeof createHarness>[0]): Promise<LiveHarness> => {
  const harness = await createHarness(options)
  harnesses.push(harness)
  return harness
}

afterEach(async() => {
  await breathe()
})

afterAll(() => {
  for (const harness of harnesses) harness.dispose()
})

live('0 · connectivity', () => {
  it('resolves a free tool-calling model and completes a trivial turn', async() => {
    const model = await resolveModel()
    expect(model.length).toBeGreaterThan(0)

    console.info(`[live-e2e] model under test: ${model}`)

    const harness = await make()
    harness.setMode('ask')
    const reply = await harness.send('t-conn', 'Reply with the single word: ready')
    expect(reply.toLowerCase()).toContain('ready')
  })
})

live('1 · conversation memory (durable thread)', () => {
  it('recalls a fact from an earlier turn in the same thread', async() => {
    const harness = await make()
    harness.setMode('ask')
    await harness.send('t-memory', 'My protagonist is a lighthouse keeper named Odalys Finch.')
    const reply = await harness.send('t-memory', 'What is my protagonist called? Name only.')
    expect(reply).toMatch(/Odalys|Finch/i)
  })
})

live('2 · grounding: reads the actual project, not its imagination', () => {
  it('answers a bible fact using the read tools', async() => {
    const harness = await make()
    harness.setMode('ask')
    const reply = await harness.send(
      't-ground',
      'Check the story bible: what colour are Zara Voss’s eyes? One word answer.'
    )
    expect(reply).toMatch(/grey|gray/i)
  })
})

live('3 · writing goes to FILES via review, never chat-paste', () => {
  it('produces an edit proposal when asked to write a scene', async() => {
    const harness = await make()
    harness.setMode('auto')
    await harness.send(
      't-write',
      'Write a very short (3 sentence) new scene where Zara finds a hidden cellar door, ' +
        'and add it to chapter one of the manuscript. Save it as a new scene file.'
    )
    // The deliverable is a review-gated proposal — chat text alone is a fail.
    expect(harness.editProposals.length).toBeGreaterThanOrEqual(1)
    const proposal = JSON.stringify(harness.editProposals[0])
    expect(proposal.toLowerCase()).toMatch(/cellar|door|zara/)
  })
})

live('4 · plan mode: live plan file, proposal card, no writes', () => {
  it('saves a plan file while brainstorming and cannot touch prose', async() => {
    const harness = await make()
    harness.setMode('plan')
    await harness.send(
      't-plan',
      'Let’s plan a new subplot where the letter-writer turns out to be Zara’s missing sister. ' +
        'Start a plan for it.'
    )
    const plansDir = path.join(harness.root, 'plans')
    const planFiles = fs.existsSync(plansDir) ? fs.readdirSync(plansDir) : []
    expect(planFiles.length).toBeGreaterThanOrEqual(1)
    // Plan mode binds no write tools — mechanically nothing can be proposed.
    expect(harness.editProposals).toHaveLength(0)
  })

  it('propose_plan raises the approval card with the plan content', async() => {
    const harness = await make()
    harness.setMode('plan')
    await harness.send(
      't-plan2',
      'Create a plan titled "Sister Reveal" with three numbered steps for introducing ' +
        'Zara’s missing sister. Then immediately propose the plan for my approval.'
    )
    expect(harness.planProposals.length).toBeGreaterThanOrEqual(1)
    expect(harness.planProposals[0].title.length).toBeGreaterThan(0)
    expect(harness.planProposals[0].content.length).toBeGreaterThan(20)
  })
})

live('5 · ask mode: spawning waits for the writer', () => {
  it('requests approval before running sub-agents, then runs them', async() => {
    const harness = await make()
    harness.setMode('ask')
    await harness.send(
      't-ask',
      'Use one explorer sub-agent to inventory the manuscript: list every scene with a ' +
        'one-line description. Spawn the agent to do it.'
    )
    expect(harness.approvals.length).toBeGreaterThanOrEqual(1)
    // Approved (harness default) — the agent actually ran to completion.
    const finished = harness.agentStatuses.filter((s) => s.status === 'done')
    expect(finished.length).toBeGreaterThanOrEqual(1)
  })

  it('a declined wave runs nothing', async() => {
    const harness = await make({ approve: () => false })
    harness.setMode('ask')
    const reply = await harness.send(
      't-decline',
      'Spawn one explorer sub-agent to inventory the manuscript scenes.'
    )
    expect(harness.approvals.length).toBeGreaterThanOrEqual(1)
    expect(harness.agentStatuses).toHaveLength(0)
    expect(reply.length).toBeGreaterThan(0)
  })
})

live('6 · auto mode: full agentic loop end to end', () => {
  it('spawns without asking and delivers a grounded report', async() => {
    const harness = await make()
    harness.setMode('auto')
    const reply = await harness.send(
      't-auto',
      'Spawn an explorer to read every scene in the manuscript, then tell me: which scene ' +
        'mentions Amityville?'
    )
    expect(harness.approvals).toHaveLength(0)
    expect(reply.toLowerCase()).toMatch(/letter|amityville/)
  })
})

live('7 · blueprint: empty-project onboarding produces real artifacts', () => {
  it('setting up a fresh novel yields bible/scene proposals or structure, not chat-paste', async() => {
    const harness = await make({ root: createEmptyLiveProject() })
    harness.setMode('auto')
    await harness.send(
      't-blueprint',
      'I want to start a gothic mystery novella about a lighthouse keeper named Odalys. ' +
        'Set the project up for me: a bible page for Odalys and a first chapter with an ' +
        'opening scene.'
    )
    const fs = await import('fs')
    const path = await import('path')
    const bibleExists = fs.existsSync(path.join(harness.root, 'bible'))
    const structure = fs.existsSync(path.join(harness.root, '.wordbird', 'structure.json'))
      ? fs.readFileSync(path.join(harness.root, '.wordbird', 'structure.json'), 'utf8')
      : ''
    // Real setup artifacts: review-gated proposals (bible/scene prose) and/or
    // structural shells in the binder. Chat text alone is a fail.
    const producedSomething =
      harness.editProposals.length > 0 || bibleExists || structure.includes('chapter')
    expect(producedSomething).toBe(true)
  })
})
