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

live('4 · ask mode: live plan file, proposal card, no writes', () => {
  it('saves a plan file while brainstorming and cannot touch prose', async() => {
    const harness = await make()
    harness.setMode('ask')
    await harness.send(
      't-plan',
      'Let’s plan a new subplot where the letter-writer turns out to be Zara’s missing sister. ' +
        'Start a plan for it.'
    )
    const plansDir = path.join(harness.root, 'plans')
    const planFilesOf = (): string[] => (fs.existsSync(plansDir) ? fs.readdirSync(plansDir) : [])
    if (planFilesOf().length === 0) {
      // A weak model may interview first — one writer-like nudge is fair.
      await harness.send('t-plan', 'Save the plan file now with what we have so far.')
    }
    expect(planFilesOf().length).toBeGreaterThanOrEqual(1)
    // Ask mode binds no write tools — mechanically nothing can be proposed.
    expect(harness.editProposals).toHaveLength(0)
  })

  it('propose_plan raises the approval card with the plan content', async() => {
    const harness = await make()
    harness.setMode('ask')
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

live('5 · ask mode: read-only agents run freely, edits stay impossible', () => {
  it('an explorer runs to completion in ask mode with zero proposals', async() => {
    const harness = await make()
    harness.setMode('ask')
    await harness.send(
      't-ask',
      'Use one explorer sub-agent to inventory the manuscript: list every scene with a ' +
        'one-line description. Spawn the agent to do it.'
    )
    const finished = harness.agentStatuses.filter((s) => s.status === 'done')
    expect(finished.length).toBeGreaterThanOrEqual(1)
    expect(harness.editProposals).toHaveLength(0)
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

live('8 · methodology: discovery writer gets discovery treatment', () => {
  it('records the method via set_writing_method and does not force outline shells', async() => {
    const harness = await make({ root: createEmptyLiveProject() })
    harness.setMode('auto')
    await harness.send(
      't-method',
      'I am a discovery writer — I hate outlines, I find the story as I write. ' +
        'Set my project up for a ghost-story novella and remember how I like to work.'
    )
    // A faithful onboarding interviews first — answer and let it finish.
    await harness.send(
      't-method',
      'Premise: a lighthouse keeper who hears her drowned sister knocking. Gothic tone, ' +
        'third person past, around 20k words. No structure template. Go ahead.'
    )
    const fs = await import('fs')
    const path = await import('path')
    const meta = JSON.parse(
      fs.readFileSync(path.join(harness.root, '.wordbird', 'project.json'), 'utf8')
    )
    // The method was actually recorded through the tool…
    expect(meta.planningStyle).toBe('discovery')
    // …and no outline scaffolding was imposed on a pantser (≤2 units:
    // at most an opening scene inside one chapter, no scene-list dump).
    const structurePath = path.join(harness.root, '.wordbird', 'structure.json')
    if (fs.existsSync(structurePath)) {
      const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'))
      interface UnitLike {
        children?: UnitLike[]
      }
      const countLeaves = (units: UnitLike[]): number =>
        units.reduce((sum, u) => sum + (u.children ? countLeaves(u.children) : 1), 0)
      expect(countLeaves(structure.units)).toBeLessThanOrEqual(2)
    }
  })
})

live('9 · timeline is readable: story-time questions get grounded answers', () => {
  it('answers which scene happens first in story time from `when` metadata', async() => {
    const harness = await make()
    // Seed story-time metadata: the letter scene predates the alley opening.
    const { structureService } = await import(
      '../../src/main/services/novel/StructureService'
    )
    const structure = await structureService.loadReconciled(harness.root)
    const chapter = structure.units[0]
    const opening = chapter.children!.find((u) => u.title.includes('opening'))!
    const letter = chapter.children!.find((u) => u.title.includes('letter'))!
    await structureService.updateUnit(harness.root, structure, opening.id, {
      when: '1954-03-12'
    })
    await structureService.updateUnit(harness.root, structure, letter.id, {
      when: '1953-11-02'
    })

    harness.setMode('ask')
    const reply = await harness.send(
      't-when',
      'Looking at story time (the when metadata), which scene happens EARLIEST ' +
        'chronologically? Name the scene.'
    )
    expect(reply.toLowerCase()).toContain('letter')
  })
})

live('10 · questions arrive as selectable option cards', () => {
  it('brainstorming asks via ask_writer instead of a question wall', async() => {
    const harness = await make({ root: createEmptyLiveProject() })
    harness.setMode('ask')
    await harness.send('t-card', 'Brainstorm a premise for my next novel.')
    expect(harness.writerQuestions.length).toBeGreaterThanOrEqual(1)
    const first = harness.writerQuestions[0]
    expect(first.options.length).toBeGreaterThanOrEqual(2)
  })
})
