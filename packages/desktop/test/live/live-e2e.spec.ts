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

live('11 · deletes always ask, even in auto mode', () => {
  it('deleting a scene raises an approval and executes only after consent', async() => {
    const harness = await make()
    harness.setMode('auto')
    await harness.send(
      't-delete',
      'Delete the scene about the letter from the manuscript — remove it completely.'
    )
    const deleteApprovals = harness.approvals.filter((a) => a.summary.includes('DELETE'))
    expect(deleteApprovals.length).toBeGreaterThanOrEqual(1)

    const fs = await import('fs')
    const path = await import('path')
    expect(fs.existsSync(path.join(harness.root, 'manuscript/chapter-one/the-letter.md'))).toBe(
      false
    )
  })
})

live('12 · review outcomes reach the model (acceptance loop)', () => {
  it('a rejected edit is acknowledged as NOT in the manuscript', async() => {
    const harness = await make()
    harness.setMode('approvals')
    await harness.send(
      't-review',
      'Rewrite the opening scene’s first sentence so it mentions thunder. ' +
        'Propose the edit to the file.'
    )
    expect(harness.editProposals.length).toBeGreaterThanOrEqual(1)

    // The writer rejects it — exactly the note LangGraphManager injects.
    const os = await import('os')
    const fsm = await import('fs')
    const pathm = await import('path')
    const { EditResolutionTracker } = await import(
      '../../src/main/services/ai/EditResolutionTracker'
    )
    const stateDir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'wordbird-live-review-'))
    const tracker = new EditResolutionTracker(() => stateDir)
    const proposal = harness.editProposals[0] as {
      edit: { id: string; filePath: string }
    }
    tracker.recordProposal(proposal as never, 't-review')
    tracker.resolve({ id: proposal.edit.id, filePath: proposal.edit.filePath, accepted: false })
    const note = tracker.drainNote()
    expect(note).toContain('REJECTED')

    const reply = await harness.send(
      't-review',
      `${note}\n\nIs your thunder rewrite in the manuscript right now? Start your answer ` +
        'with Yes or No.'
    )
    expect(reply.toLowerCase()).toMatch(/\bno\b|reject|not (in|applied|there)|declined/)
    fsm.rmSync(stateDir, { recursive: true, force: true })
  })
})

live('13 · book run: multi-segment drafting without typing continue', () => {
  it('drafts multiple scenes across auto-continued segments', async() => {
    const harness = await make({ root: createEmptyLiveProject() })
    harness.setMode('auto')

    const { driveBookRun, AUTO_CONTINUE_MESSAGE } = await import(
      '../../src/main/services/ai/bookRun'
    )
    const fsm = await import('fs')
    const pathm = await import('path')

    let segments = 0
    const { CONTINUE_RE } = await import('../../src/main/services/ai/bookRun')
    let first = await harness.send(
      't-bookrun',
      'AUTO MODE BOOK RUN. Do exactly this, no questions: (1) save_plan a plan titled ' +
        '"Novella" with three unchecked items: scene 1, scene 2, scene 3. (2) Draft scene 1 ' +
        'now — propose_new_unit with 3–4 sentences of ghost-story prose — and tick its plan ' +
        'item. (3) End your reply with the exact final line "CONTINUE: scene 2". In later ' +
        'segments repeat for scene 2 then scene 3, and after scene 3 wrap up WITHOUT the ' +
        'CONTINUE line.'
    )
    if (!CONTINUE_RE.test(first)) {
      // Weak free models regularly do the work but drop the protocol line —
      // one corrective nudge is fair (same policy as flow 4).
      console.info(`[live-e2e] first book-run reply lacked CONTINUE (tail: …${first.slice(-160)})`)
      first = await harness.send(
        't-bookrun',
        'You forgot the protocol. Plan items remain unchecked, so end THIS reply with the ' +
          'exact final line "CONTINUE: scene 2" (nothing after it).'
      )
    }
    const final = await driveBookRun(first, {
      invokeNext: async() => {
        segments += 1
        return harness.send('t-bookrun', AUTO_CONTINUE_MESSAGE)
      },
      isAuto: () => true,
      sessionTokens: () => 0,
      progressSignature: () => {
        // Real progress = proposals + structure growth (edits are not
        // applied to disk in this harness, so count proposals too).
        const structurePath = pathm.join(harness.root, '.wordbird', 'structure.json')
        const structure = fsm.existsSync(structurePath)
          ? fsm.readFileSync(structurePath, 'utf8')
          : ''
        return `${harness.editProposals.length}:${structure.length}`
      },
      emitStatus: () => {},
      maxContinuations: 4,
      tokenCeiling: 10_000_000
    })

    // The run continued at least once with zero writer input, and the
    // protocol line never leaks into the final writer-facing reply.
    expect(segments).toBeGreaterThanOrEqual(1)
    expect(final).not.toMatch(/(^|\n)CONTINUE:/)
    // Multiple scenes came out of the run (shells in structure + proposed
    // prose), proving segment N+1 kept working the same plan.
    expect(harness.editProposals.length).toBeGreaterThanOrEqual(2)
  }, 600_000)
})

live('14 · context budget reflects the real model window', () => {
  it('usage events carry the resolved window, not the legacy default', async() => {
    const harness = await make()
    harness.setMode('ask')
    harness.orchestrator.setContextBudget(131072, 8192)
    await harness.send('t-budget', 'Reply with the single word: ok')
    expect(harness.contextUsages.length).toBeGreaterThanOrEqual(1)
    const last = harness.contextUsages[harness.contextUsages.length - 1]
    expect(last.contextWindow).toBe(131072)
    expect(last.budgetTokens).toBe(131072 - 8192 - 8000)
    expect(last.budgetChars).not.toBe(60000)
  })
})

live('15 · context prep: orientation happens before prose edits', () => {
  it('continuing the story reads/searches the project before the first proposal', async() => {
    const harness = await make()
    harness.setMode('auto')
    await harness.send(
      't-prep',
      'Continue the story: draft the next scene after the letter scene, where Zara ' +
        'decides to drive to Amityville. Keep it to 4 sentences.'
    )
    if (harness.editProposals.length === 0) {
      // A weak model may orient and then check in first — one nudge is fair.
      await harness.send(
        't-prep',
        'Yes — draft it now as a new scene file in chapter one. No more questions.'
      )
    }
    expect(harness.editProposals.length).toBeGreaterThanOrEqual(1)

    // Evidence of orientation BEFORE proposing: supervisor read/search tool
    // activity or a completed worker (drafters read bible/summaries first;
    // explorers count too). Proposing with zero reads = drafting blind.
    const firstProposalAt = harness.activity.findIndex((event) =>
      /propose/i.test(`${event.label} ${event.detail ?? ''}`)
    )
    const prelude =
      firstProposalAt === -1 ? harness.activity : harness.activity.slice(0, firstProposalAt)
    const oriented = prelude.some(
      (event) =>
        (event.kind === 'tool' &&
          /read_|search_manuscript|where_appears|list_structure/i.test(
            `${event.label} ${event.detail ?? ''}`
          )) ||
        event.kind === 'agent-start'
    )
    expect(oriented).toBe(true)
  })
})

live('16 · history is a tool: agents answer from the snapshot mini-git', () => {
  it('reports what changed in a file since an earlier snapshot', async() => {
    const harness = await make()
    const { snapshotService } = await import('../../src/main/services/novel/SnapshotService')
    await snapshotService.snapshot(harness.root, 'first draft')
    fs.writeFileSync(
      path.join(harness.root, 'manuscript/chapter-one/opening.md'),
      'Detective Zara Voss stepped into the MOONLIT alley, her grey eyes scanning the dark.\n'
    )
    await snapshotService.snapshot(harness.root, 'moonlight rewrite')

    harness.setMode('ask')
    const reply = await harness.send(
      't-history',
      'Using the project snapshot history: what changed in the opening scene between the ' +
        '"first draft" snapshot and now? Quote the changed wording.'
    )
    // Grounded in the real diff — the rewrite swapped rain-slick → MOONLIT.
    expect(reply.toLowerCase()).toMatch(/moonlit|rain-slick/)
    const usedHistory = harness.activity.some((event) =>
      /list_snapshots|diff_snapshot_file|read_snapshot_file|preview_snapshot/.test(
        `${event.label} ${event.detail ?? ''}`
      )
    )
    expect(usedHistory).toBe(true)
  })
})

live('17 · deterministic prose lint backs the polish loop', () => {
  it('linting a scene surfaces real findings via lint_prose', async() => {
    const harness = await make()
    fs.writeFileSync(
      path.join(harness.root, 'manuscript/chapter-one/opening.md'),
      'Zara was very tired and very cold and very alone. She felt the the rain soak through.\n'
    )
    harness.setMode('ask')
    const reply = await harness.send(
      't-lint',
      'Run a prose lint on the opening scene and report the top findings in one short list.'
    )
    const usedLint = harness.activity.some((event) =>
      /lint_prose/.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(usedLint).toBe(true)
    // Grounded in the deterministic findings: "very" spam / doubled "the".
    expect(reply.toLowerCase()).toMatch(/very|doubled|repeat/)
  })
})

live('18 · web research flows through the provenance gate', () => {
  it('a researcher searches, fetches only returned URLs, and cites sources', async() => {
    const harness = await make()
    harness.setMode('ask')
    const reply = await harness.send(
      't-research',
      'Research online: what fuel did lighthouse lamps burn in the 1890s? ' +
        'Give a one-paragraph answer with at least one source URL.'
    )
    // Real web/wiki tool activity happened (search first — web_fetch of a
    // guessed URL is mechanically refused and coaches the model to search).
    const usedWeb = harness.activity.some((event) =>
      /web_search|wiki_search|wiki_read|web_fetch/.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(usedWeb).toBe(true)
    // The answer is grounded and cited.
    expect(reply).toMatch(/https?:\/\//)
    expect(reply.toLowerCase()).toMatch(/oil|kerosene|paraffin|whale|lard|petroleum|gas/)
  })
})
