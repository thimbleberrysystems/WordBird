/**
 * Live end-to-end suite: every core Biscuit flow against a REAL model,
 * PROVIDER-PARAMETERIZED (see harness.ts / provider.ts):
 *
 *   subscription — Claude Agent SDK on the writer's Claude plan
 *                  (sonnet). Local dev default when logged in. Every
 *                  turn bills the plan: heavy flows need LIVE_HEAVY=1,
 *                  and an end-of-run LIVE TOKEN REPORT prints the cost.
 *   openrouter   — free tool-calling model. The CI path; heavy flows
 *                  always run here.
 *
 *   LIVE_PROVIDER=subscription pnpm run test:live
 *   LIVE_PROVIDER=openrouter OPENROUTER_KEY=sk-or-… pnpm run test:live
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
  hasLiveProvider,
  heavyEnabled,
  liveProvider,
  printTokenReport,
  resolveModel,
  createHarness,
  createEmptyLiveProject,
  breathe,
  type LiveHarness
} from './harness'

const live = describe.skipIf(!hasLiveProvider())
/** Flows that pin OpenRouter-specific mechanics (model catalog, window
 * resolution) — meaningless against the SDK runtime. */
const liveOpenRouterOnly = describe.skipIf(liveProvider !== 'openrouter')
/** Expensive multi-wave flows: free CI always runs them; on the
 * writer-billed subscription they need LIVE_HEAVY=1. */
const liveHeavy = describe.skipIf(!hasLiveProvider() || !heavyEnabled())

/** A real research note landed on disk (recursively) — the persistence
 * contract, distinct from the save_research tool merely having fired. */
const researchNoteLanded = (root: string): boolean => {
  const dir = path.join(root, 'bible', 'research')
  if (!fs.existsSync(dir)) return false
  const walk = (d: string): boolean =>
    fs.readdirSync(d, { withFileTypes: true }).some((entry) => {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) return walk(full)
      return entry.isFile() && entry.name.endsWith('.md')
    })
  return walk(dir)
}

/**
 * A CENSUS of every subsystem a novel project touches. Returned as counts
 * so a failure names the subsystem that never engaged, instead of just
 * "something is missing" — the whole point of the whole-novel flow.
 */
interface ProjectCensus {
  proseFiles: number
  proseWords: number
  chapters: number
  scenes: number
  scenesWithSynopsis: number
  scenesWithStatus: number
  scenesWithWhen: number
  biblePages: number
  researchNotes: number
  summaries: number
  facts: number
  continuityIssues: number
  plans: number
  snapshots: number
}

const countFilesUnder = (dir: string, extension = '.md'): number => {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += countFilesUnder(full, extension)
    else if (entry.name.endsWith(extension)) total += 1
  }
  return total
}

const surveyProject = async(root: string): Promise<ProjectCensus> => {
  const { structureService } = await import('../../src/main/services/novel/StructureService')
  let chapters = 0
  let scenes = 0
  let scenesWithSynopsis = 0
  let scenesWithStatus = 0
  let scenesWithWhen = 0
  let proseFiles = 0
  let proseWords = 0
  try {
    const structure = await structureService.loadReconciled(root)
    const walk = (units: Array<Record<string, unknown>>): void => {
      for (const unit of units) {
        const children = unit.children as Array<Record<string, unknown>> | undefined
        if (children) {
          chapters += 1
          walk(children)
          continue
        }
        scenes += 1
        if (String(unit.synopsis ?? '').trim()) scenesWithSynopsis += 1
        if (String(unit.status ?? '').trim()) scenesWithStatus += 1
        if (String(unit.when ?? '').trim()) scenesWithWhen += 1
        const relative = typeof unit.path === 'string' ? unit.path : null
        if (!relative) continue
        try {
          const text = fs.readFileSync(path.join(root, relative), 'utf8').trim()
          if (text.length > 0) {
            proseFiles += 1
            proseWords += text.split(/\s+/).length
          }
        } catch {
          // a unit whose file vanished is a binder-drift problem, not prose
        }
      }
    }
    walk(structure.units as unknown as Array<Record<string, unknown>>)
  } catch {
    // an unreadable binder leaves the structural counts at zero
  }

  const jsonCount = (file: string, key: string): number => {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as
        | Record<string, unknown[]>
        | unknown[]
      if (Array.isArray(parsed)) return parsed.length
      return Array.isArray(parsed[key]) ? (parsed[key] as unknown[]).length : 0
    } catch {
      return 0
    }
  }

  return {
    proseFiles,
    proseWords,
    chapters,
    scenes,
    scenesWithSynopsis,
    scenesWithStatus,
    scenesWithWhen,
    biblePages: countFilesUnder(path.join(root, 'bible')),
    researchNotes: countFilesUnder(path.join(root, 'bible', 'research')),
    summaries: countFilesUnder(path.join(root, '.wordbird', 'summaries')),
    facts: jsonCount('.wordbird/continuity/facts.json', 'facts'),
    continuityIssues: jsonCount('.wordbird/continuity/issues.json', 'issues'),
    plans: countFilesUnder(path.join(root, 'plans')),
    // Reported, never asserted: the live harness has no renderer and does
    // not git-init its scratch project, so snapshots are a property of the
    // app rather than of this flow (they are covered by flow 16).
    snapshots: fs.existsSync(path.join(root, '.git')) ? 1 : 0
  }
}

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
  printTokenReport()
})

liveOpenRouterOnly('0 · connectivity (openrouter model resolution)', () => {
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

    // STRUCTURE CRAFT: the scene is named for what happens in it, never
    // after its parent chapter — a scene titled "Chapter One" lands at
    // chapter-one/chapter-one.md, the doubled path writers read as a bug.
    const scenePaths = harness.editProposals
      .map((proposal) => (proposal as { edit: { filePath: string } }).edit.filePath)
      .filter((filePath) => filePath.startsWith('manuscript/'))
    for (const filePath of scenePaths) {
      const parts = filePath.split('/')
      const fileSlug = (parts.pop() ?? '').replace(/\.md$/, '')
      const parentSlug = parts.pop() ?? ''
      expect(fileSlug, `scene repeats its chapter name: ${filePath}`).not.toBe(parentSlug)
    }
  })
})

live('3b · STRUCTURE CRAFT: chapters name folders, scenes name what happens', () => {
  /** Every leaf path in the binder, from disk. */
  const leafPaths = (root: string): string[] => {
    const file = path.join(root, '.wordbird', 'structure.json')
    if (!fs.existsSync(file)) return []
    const structure = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      units?: Array<Record<string, unknown>>
    }
    const out: string[] = []
    const walk = (units: Array<Record<string, unknown>>): void => {
      for (const unit of units) {
        if (typeof unit.path === 'string') out.push(unit.path)
        if (Array.isArray(unit.children)) walk(unit.children as Array<Record<string, unknown>>)
      }
    }
    walk(structure.units ?? [])
    return out
  }

  /** A path whose file slug repeats its parent folder (the-cellar/the-cellar.md). */
  const doubled = (paths: string[]): string[] =>
    paths.filter((filePath) => {
      const parts = filePath.split('/')
      const fileSlug = (parts.pop() ?? '').replace(/\.md$/, '')
      return fileSlug === (parts.pop() ?? '')
    })

  it('POSITIVE: builds a chapter of distinctly-named scenes, no doubled paths', async() => {
    const harness = await make()
    harness.setMode('auto')
    await harness.send(
      't-structure-pos',
      'Add a new chapter called "The Cellar" to the manuscript, and give it two short ' +
        'scenes (2 sentences each) — Zara forcing the cellar door, then what she finds ' +
        'below. Create the units and write the prose.'
    )

    const paths = leafPaths(harness.root)
    const cellarScenes = paths.filter((filePath) => filePath.includes('cellar'))
    // The chapter became a FOLDER holding scene FILES…
    expect(cellarScenes.length, `no cellar scenes created (paths: ${paths.join(', ')})`)
      .toBeGreaterThanOrEqual(1)
    // …and no scene repeats its chapter's name.
    expect(doubled(paths), 'a scene repeated its chapter name').toEqual([])
    // Scene filenames are distinct from each other (named for what happens).
    const slugs = cellarScenes.map((filePath) => filePath.split('/').pop())
    expect(new Set(slugs).size).toBe(slugs.length)
  }, 300_000)

  it('NEGATIVE: a one-scene chapter still gets a distinctly-named scene', async() => {
    // THE prj14 SHAPE, unprompted: asked for a chapter with a single scene,
    // the agent must not name that scene after the chapter — that is the
    // doubled path (the-vault/the-vault.md) writers read as a bug. The
    // writer never asked for it here, so the agent must not invent it.
    const harness = await make()
    harness.setMode('auto')
    await harness.send(
      't-structure-neg',
      'Add a chapter called "The Vault" to the manuscript with a single short scene ' +
        '(2 sentences) where Zara cracks the vault. Create the units and write the prose.'
    )

    const paths = leafPaths(harness.root)
    expect(paths.some((filePath) => filePath.includes('vault')), 'no vault scene created')
      .toBe(true)
    expect(
      doubled(paths),
      `agent invented a doubled path unprompted: ${doubled(paths).join(', ')}`
    ).toEqual([])
  }, 300_000)

  it('NEGATIVE: an explicit writer override is obeyed, but the cost is explained', async() => {
    // The writer is the author. When they DEMAND the same name, refusing
    // outright would be paternalistic — but doing it silently would leave
    // them with a wart they never understood. Inform, then comply.
    const harness = await make()
    harness.setMode('auto')
    const reply = await harness.send(
      't-structure-override',
      'Create a chapter titled "The Cistern" containing exactly one scene, and title that ' +
        'scene "The Cistern" too — the SAME name as the chapter. I know it duplicates; ' +
        'do it anyway. Then write two sentences of prose in it.'
    )

    // Either it complied (writer autonomy) or it declined — but it must not
    // pretend. The tradeoff has to be named in the reply.
    const explained =
      /same name|same title|duplicat|redundant|repeat|doubl|rename|different (name|title)/i.test(
        reply
      )
    expect(
      explained,
      `obeyed or refused without ever naming the tradeoff: ${reply.slice(0, 300)}`
    ).toBe(true)
  }, 300_000)
})

live('3c · research providers reach the agent (books/papers + rotation)', () => {
  it('a researcher can consult the catalogue APIs and saves what it found', async() => {
    // The new keyless providers are only useful if a ROLE can actually
    // reach them — a tool registered but unwired is invisible to the model.
    const harness = await make()
    harness.setMode('ask')
    const reply = await harness.send(
      't-providers',
      'Find me one or two published BOOKS about ancient Elam using the book search tool, ' +
        'then save a short research note listing them with their links.'
    )

    const used = harness.activity.some((event) =>
      /search_books|search_papers|wiki_search|web_search/.test(
        `${event.label} ${event.detail ?? ''}`
      )
    )
    expect(used, 'no research tool was used at all').toBe(true)
    // Research must PERSIST — the whole point of the note.
    expect(researchNoteLanded(harness.root), 'no research note persisted').toBe(true)
    // And the reply should name something concrete rather than hedging.
    expect(reply.length).toBeGreaterThan(40)
  }, 300_000)
})

liveHeavy('39 · WHOLE NOVEL: every subsystem engages, or we learn which did not — HEAVY', () => {
  it('one instruction produces a real project: prose, binder, bible, research, knowledge', async() => {
    // The point of this flow is COVERAGE, not prose quality. A novel
    // project is a dozen subsystems co-operating; any one of them can stop
    // engaging without a single unit test noticing. The census below names
    // whichever one went quiet.
    const harness = await make({
      root: createEmptyLiveProject(),
      label: 'flow-39-whole-novel',
      autoApplyEdits: true // auto mode writes prose to disk via the renderer
    })
    harness.setMode('auto')

    const { driveBookRun, AUTO_CONTINUE_MESSAGE, CONTINUE_RE } = await import(
      '../../src/main/services/ai/bookRun'
    )

    let reply = await harness.send(
      't-novel',
      'AUTO MODE. Write the opening of a SHORT historical novella set in 1890s lighthouse ' +
        'Cornwall. Work like a novelist, not a chatbot:\n' +
        '1. Research the period briefly and SAVE what you find.\n' +
        '2. Save a plan with the first three scenes as unchecked items.\n' +
        '3. Create a chapter and draft those scenes (3-4 sentences each is fine).\n' +
        '4. Give every scene binder metadata: synopsis, status, and a story-time `when`.\n' +
        '5. Create bible pages for the people and places you invent.\n' +
        '6. Record the durable facts and note any continuity risk you spot.\n' +
        'End each segment with the exact final line "CONTINUE: <next step>" while plan ' +
        'items remain unchecked.'
    )

    if (CONTINUE_RE.test(reply)) {
      reply = await driveBookRun(reply, {
        invokeNext: async() => harness.send('t-novel', AUTO_CONTINUE_MESSAGE),
        isAuto: () => true,
        sessionTokens: () => 0,
        progressSignature: () => `${harness.editProposals.length}`,
        emitStatus: () => {},
        maxContinuations: 3,
        tokenCeiling: Number.MAX_SAFE_INTEGER
      })
    }

    const census = await surveyProject(harness.root)
    // Printed unconditionally: a PASS with thin numbers is still a signal.
    console.info(`[flow-39] census ${JSON.stringify(census)}`)

    // ---- MANUSCRIPT: prose actually exists on disk ----
    expect(census.scenes, 'no scenes were created in the binder').toBeGreaterThanOrEqual(2)
    expect(census.proseFiles, 'binder units exist but no prose was written').toBeGreaterThanOrEqual(2)
    expect(census.proseWords, 'prose files exist but are essentially empty').toBeGreaterThan(60)

    // ---- VIEWS: corkboard / outline / timeline render from unit meta ----
    expect(
      census.scenesWithSynopsis,
      'no scene carries a synopsis — the corkboard would be blank'
    ).toBeGreaterThanOrEqual(1)
    expect(
      census.scenesWithStatus,
      'no scene carries a status — the corkboard dots and outline column would be empty'
    ).toBeGreaterThanOrEqual(1)

    // ---- KNOWLEDGE: the project remembers what it decided ----
    expect(
      census.biblePages,
      'no bible page was created — the story has no canon to check against'
    ).toBeGreaterThanOrEqual(1)
    expect(
      census.plans,
      'no plan file — nothing drove the multi-segment work'
    ).toBeGreaterThanOrEqual(1)

    // ---- RESEARCH + LEDGER: at least one durable knowledge artifact ----
    // Deliberately an OR: a model may reasonably capture period knowledge
    // as a research note, as facts, or as a logged continuity risk. Zero of
    // the three means the knowledge layer never engaged at all.
    const knowledge = census.researchNotes + census.facts + census.continuityIssues
    expect(
      knowledge,
      `knowledge layer never engaged (research=${census.researchNotes} facts=${census.facts} ` +
        `issues=${census.continuityIssues})`
    ).toBeGreaterThanOrEqual(1)
  }, 1_800_000)
})

live('40 · SYNC: a drafted scene comes back annotated for the views', () => {
  it('drafting leaves the binder renderable, without being asked field by field', async() => {
    // Flow 22 proves metadata lands when the writer ASKS for it. This is
    // the harder contract: the drafting aftercare should leave the scene
    // renderable in the corkboard/outline on its own, so the writer's views
    // never silently drift out of sync with the manuscript.
    const harness = await make({ label: 'flow-40-sync', autoApplyEdits: true })
    harness.setMode('auto')
    await harness.send(
      't-sync',
      'Draft a new scene for chapter one where Zara searches the lighthouse store room ' +
        '(3 sentences), then make sure the binder is up to date for it.'
    )

    const census = await surveyProject(harness.root)
    console.info(`[flow-40] census ${JSON.stringify(census)}`)

    // A new scene exists beyond the two seeded ones…
    expect(census.scenes, 'no new scene was added').toBeGreaterThanOrEqual(3)
    // …and the binder is renderable: SOME scene carries a synopsis and a
    // status, which is what the corkboard and outline actually draw.
    expect(
      census.scenesWithSynopsis,
      'nothing in the binder carries a synopsis — the corkboard would be blank'
    ).toBeGreaterThanOrEqual(1)
    expect(
      census.scenesWithStatus,
      'nothing in the binder carries a status'
    ).toBeGreaterThanOrEqual(1)
  }, 600_000)
})

live('41 · VOICE: onboarding asks for the writer’s prose and never invents it', () => {
  it('requests voice exemplars without fabricating any', async() => {
    // Why this flow exists: unrelated novels were reading alike because the
    // scaffolded style page stated a voice in its own placeholders. With the
    // placeholders neutralized, the ONLY voice definition is the writer's —
    // so onboarding has to ask for it, and must never paper over the gap by
    // writing exemplars itself (a model-authored exemplar would just teach
    // the model its own voice back).
    const harness = await make({ root: createEmptyLiveProject(), label: 'flow-41-voice' })
    harness.setMode('auto')
    // Onboarding INTERVIEWS before it builds, and the voice-exemplar ask lives
    // at the SETUP-OFFER stage (playbook 1), AFTER that interview — not on the
    // opening turn. A live model runs the interview longer than a fixed two
    // turns (it circles back on premise/stakes), so we answer everything and
    // then firmly close the interview, driving it to the setup stage where the
    // voice ask fires. We do NOT mention voice/style ourselves — the whole
    // point is that onboarding raises it unprompted.
    const first = await harness.send(
      't-voice',
      'I want to start a literary novel about a beekeeper in rural Georgia. Set the project up.'
    )
    const second = await harness.send(
      't-voice',
      'Third limited, past tense, about 60k words, and I discover as I go rather than ' +
        'outlining. The emotional core is inherited guilt — the beekeeper inherited her ' +
        'father\'s hives and his unspoken debts. That is the whole story picture.'
    )
    const third = await harness.send(
      't-voice',
      'I have nothing more to add about the story — please go ahead and set the project up ' +
        'now: the bible and an opening. Ask me for anything else you need to do it well.'
    )

    const asked = `${first} ${second} ${third} ${harness.writerQuestions.map((q) => q.question).join(' ')}`
    // BEHAVIOR, not wording: some request for the writer's own writing. This
    // is the product contract — onboarding asks for the writer's voice rather
    // than inventing one; if it still never asks after the interview is
    // closed, that is a real gap, not a timing artifact.
    expect(
      /voice|style|sample|exemplar|passage|excerpt|prose you|your writing|sound like|write like|how you write/i.test(asked),
      `onboarding never asked for the writer's voice across the whole setup. Reply: ${asked.slice(0, 600)}`
    ).toBe(true)

    // THE HARD INVARIANT: no exemplar may exist that the writer did not
    // supply — not on disk, not as a proposal.
    const voiceDir = path.join(harness.root, 'bible', 'voice')
    const written = fs.existsSync(voiceDir)
      ? fs.readdirSync(voiceDir).filter((n) => /\.(md|markdown)$/i.test(n))
      : []
    expect(written, `agent fabricated voice exemplars: ${written.join(', ')}`).toEqual([])
    const proposedVoice = harness.editProposals.filter((p) =>
      String((p as { path?: string }).path ?? '').includes('bible/voice/')
    )
    expect(proposedVoice, 'agent proposed a voice exemplar it wrote itself').toHaveLength(0)
  }, 600_000)
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
  it('a scene is never deleted without a destructive approval', async() => {
    const fs = await import('fs')
    const path = await import('path')
    const harness = await make()
    const letter = path.join(harness.root, 'manuscript/chapter-one/the-letter.md')
    harness.setMode('auto')
    await harness.send(
      't-delete',
      'Delete the scene about the letter from the manuscript — remove it completely.'
    )
    // A live model is (rightly) cautious about deletes and may ask before
    // acting, so give the gate every chance to fire: confirm explicitly.
    if (fs.existsSync(letter)) {
      await harness.send(
        't-delete',
        'Yes — delete manuscript/chapter-one/the-letter.md now. This is my confirmation.'
      )
    }

    // BOTH providers gate a delete but word the card differently — the
    // LangGraph orchestrator raises "DELETE requested — …", the SDK runner
    // "DESTRUCTIVE OPERATION — …" — so match on either.
    const destructiveCards = harness.approvals.filter((a) => /DELETE|DESTRUCTIVE/i.test(a.summary))
    const fileGone = !fs.existsSync(letter)

    // THE SAFETY INVARIANT (this is what "deletes always ask" means): the file
    // is NEVER removed unless a destructive card was raised first. A model that
    // declines to delete leaves the file — also safe. The one outcome that must
    // be impossible is a silent delete with no card. The deterministic gate is
    // pinned mechanically in tool-safety.spec; this confirms the real model
    // cannot find a path around it.
    expect(
      !fileGone || destructiveCards.length > 0,
      'SILENT DELETE — the scene was removed with no approval card. ' +
        `Cards: ${harness.approvals.map((a) => a.summary).join(' | ') || '(none)'}`
    ).toBe(true)

    // Diagnostic, not a gate: note whether the model actually exercised the
    // gate this run (it usually does; a stubbornly cautious model may not).
    if (destructiveCards.length === 0) {
      console.info('[flow-11] model declined to delete even after explicit confirmation (safe).')
    } else {
      console.info(
        `[flow-11] destructive gate FIRED: ${destructiveCards.length} card(s) raised; ` +
          `file ${fileGone ? 'deleted only after approval' : 'kept'}. ` +
          `Cards: ${destructiveCards.map((a) => a.summary).join(' | ')}`
      )
    }
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

liveHeavy('13 · book run: multi-segment drafting without typing continue', () => {
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
    // Scene-handoff seam: on the SDK backend drafters SHOULD PULL the
    // handoff (get_scene_handoff — DRAFTER_SDK_ADDENDUM asks for it once a
    // predecessor exists). On LangGraph the handoff is pushed mechanically
    // (unit-pinned), so no tool call is expected. On the SDK the pull is
    // prompt-REQUESTED, not mechanically enforced — an LLM cannot be forced
    // to emit a specific tool call — so we OBSERVE it as a diagnostic rather
    // than hard-fail on model variance. The multi-segment book-run contract
    // this flow exists to prove is already asserted above (segments≥1 +
    // editProposals≥2). To hard-enforce the pull, make it mechanical (push
    // the handoff into the drafter's context) rather than assert it here.
    if (harness.provider === 'subscription') {
      const pulledHandoff = harness.activity.some((event) =>
        /get_scene_handoff/.test(`${event.label} ${event.detail ?? ''}`)
      )
      if (!pulledHandoff) {
        console.info(
          '[flow-13] drafter did not pull get_scene_handoff this run ' +
            '(prompt-requested, model-dependent — not a book-run failure).'
        )
      }
    }
  }, 600_000)
})

liveOpenRouterOnly('14 · context budget reflects the real model window', () => {
  it('usage events carry the resolved window, not the legacy default', async() => {
    const harness = await make()
    harness.setMode('ask')
    harness.orchestrator?.setContextBudget(131072, 8192)
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

live('21 · the steward: health check finds and fixes sync gaps', () => {
  it('project_health drives real fixes for missing metadata / bible coverage', async() => {
    const harness = await make()
    // Dirty the project: a recurring character with no bible page, prose
    // in two files, and strip a scene's synopsis via the real service.
    fs.writeFileSync(
      path.join(harness.root, 'manuscript/chapter-one/opening.md'),
      'Zara waited. Ilsabet Crane watched from the dunes, and Ilsabet Crane said nothing.\n'
    )
    fs.writeFileSync(
      path.join(harness.root, 'manuscript/chapter-one/the-letter.md'),
      'The letter was unsigned. Ilsabet Crane burned it before dawn.\n'
    )
    // Forked canon in the ledger + an orphan summary: the health report
    // must carry both, and contradictions get DISPATCHED (issue logged),
    // never silently resolved.
    fs.mkdirSync(path.join(harness.root, '.wordbird/continuity'), { recursive: true })
    fs.writeFileSync(
      path.join(harness.root, '.wordbird/continuity/facts.json'),
      JSON.stringify({
        facts: [
          { id: 'f1', subject: 'Ilsabet Crane', relation: 'eye color', object: 'grey', at: 1 },
          { id: 'f2', subject: 'Ilsabet Crane', relation: 'eye color', object: 'green', at: 2 }
        ]
      })
    )
    fs.mkdirSync(path.join(harness.root, '.wordbird/summaries'), { recursive: true })
    fs.writeFileSync(
      path.join(harness.root, '.wordbird/summaries/u_deleted.md'),
      'Summary of a unit that no longer exists.'
    )
    harness.setMode('approvals')
    const reply = await harness.send(
      't-steward',
      'Run a project health check and fix what you can — metadata, summaries, missing ' +
        'bible pages. Report what you synced.'
    )
    const usedHealth = harness.activity.some((event) =>
      /project_health/.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(usedHealth).toBe(true)
    // Real fixing happened: metadata/summary writes, a proposed bible page
    // for the unlisted character, or dispatching the planted contradiction
    // (log_continuity_issue is the doctrine-correct action for forked canon).
    const fixed =
      harness.activity.some((event) =>
        /update_unit_meta|update_summary|log_continuity_issue/.test(
          `${event.label} ${event.detail ?? ''}`
        )
      ) || harness.editProposals.some((p) => JSON.stringify(p).includes('Ilsabet'))
    expect(fixed).toBe(true)
    // The planted fact contradiction was DISPATCHED, not swallowed: an
    // issue got logged, or the report names the fork (behavior, not wording).
    const dispatched =
      harness.activity.some((event) =>
        /log_continuity_issue/.test(`${event.label} ${event.detail ?? ''}`)
      ) ||
      fs.existsSync(path.join(harness.root, '.wordbird/continuity/issues.json')) ||
      /grey|green|contradict|fork/i.test(reply)
    expect(dispatched).toBe(true)
    expect(reply.length).toBeGreaterThan(40)
  })
})

live('20 · decisions are settled: recorded, then never relitigated', () => {
  it('a definitive writer call is recorded and respected in a later turn', async() => {
    const harness = await make()
    harness.setMode('approvals')
    await harness.send(
      't-decision',
      'Creative decision, final: the letter-writer is NEVER revealed on the page — the ' +
        'mystery stays open forever. Record this decision so it is never re-opened.'
    )
    const decisionsPath = path.join(harness.root, 'bible/decisions.md')
    expect(fs.existsSync(decisionsPath)).toBe(true)
    expect(fs.readFileSync(decisionsPath, 'utf8').toLowerCase()).toMatch(/letter|reveal|mystery/)

    // A later turn proposing against it must be declined, citing the decision.
    const reply = await harness.send(
      't-decision',
      'I have an idea — what if we add a final chapter revealing who wrote the letters?'
    )
    expect(reply.toLowerCase()).toMatch(/decision|settled|decided|never revealed|stays open/)
  })
})

live('19 · skills: writer-authored techniques load on demand', () => {
  it('a named skill is loaded via the skill tools and shapes the answer', async() => {
    const harness = await make()
    fs.mkdirSync(path.join(harness.root, 'skills'), { recursive: true })
    fs.writeFileSync(
      path.join(harness.root, 'skills/cliffhanger-endings.md'),
      '---\nname: Cliffhanger endings\ndescription: How this writer ends chapters.\n---\n\n' +
        'Every chapter must end mid-beat, on the phrase or image of an unanswered ' +
        'question — never after the resolution. The final line must name the danger.\n'
    )
    harness.setMode('ask')
    const reply = await harness.send(
      't-skill',
      'Using my cliffhanger-endings skill, tell me in two sentences how chapter one should end.'
    )
    const usedSkillTool = harness.activity.some((event) =>
      /use_skill|list_skills/.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(usedSkillTool).toBe(true)
    // The answer reflects the skill's distinctive doctrine, not generic advice.
    expect(reply.toLowerCase()).toMatch(/mid-beat|unanswered|danger|resolution/)
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
    // The answer is grounded and cited — either a raw source URL, or the
    // saved research note (which carries the sources in its front matter;
    // citing the note is the doctrine-preferred form).
    expect(reply).toMatch(/https?:\/\/|bible\/research\//)
    expect(reply.toLowerCase()).toMatch(/oil|kerosene|paraffin|whale|lard|petroleum|gas/)
    // Research PERSISTS: a note must actually LAND in bible/research/. The
    // weaker "or the save tool fired" form let prj12 pass green while
    // persisting nothing (2026-07-19: save_research fired but the SDK
    // returned it empty and no file was written) — the tool FIRING is not
    // the contract; a durable note on disk is.
    expect(researchNoteLanded(harness.root), 'no research note persisted to disk').toBe(true)
  })
})

liveHeavy('18b · overlapping researchers (turn ledger) — HEAVY', () => {
  it('overlapping researchers on ONE topic still complete and save (turn ledger)', async() => {
    // The research-ledger case: multiple researchers pushed at the same
    // topic used to thrash the same pages (each worker started cold).
    // Repeats are now digest-served past read 2 and the GATHERED THIS
    // TURN section warms every spawn — the behavioral contract is that
    // the turn still COMPLETES with a grounded answer and a saved note
    // (no repeat-block death spiral, no lost research), and the same
    // read target is not hammered without bound.
    const harness = await make()
    harness.setMode('ask')
    const reply = await harness.send(
      't-research-overlap',
      'Research ancient Elam for my novel: BOTH its political history AND its religion. ' +
        'Use two researchers in parallel, then give me a short combined summary.'
    )
    expect(reply.toLowerCase()).toContain('elam')
    const usedWeb = harness.activity.some((event) =>
      /web_search|wiki_search|wiki_read|web_fetch/.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(usedWeb).toBe(true)
    // No single target is called more than the shared hard cap + the
    // digest band allows (calls, not fetches: served repeats are free).
    const targetCounts = new Map<string, number>()
    for (const event of harness.activity) {
      const match = /(wiki_read|web_fetch)\s*—\s*(.{0,80})/.exec(
        `${event.label} ${event.detail ?? ''}`
      )
      if (match) {
        const key = `${match[1]}:${match[2]}`
        targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1)
      }
    }
    for (const [target, count] of targetCounts) {
      expect(count, `same-target read thrash: ${target}`).toBeLessThanOrEqual(6)
    }
    // Research persisted — a real note on disk, not merely a fired tool
    // (see flow 18: the "tool fired" fallback masked prj12's lost research).
    expect(researchNoteLanded(harness.root), 'no research note persisted to disk').toBe(true)
  })
})

// ---- Novelist-journey coverage (flows 22-27) --------------------------------

live('22 · agents populate the view metadata (corkboard/outline/timeline)', () => {
  it('filling in scene info lands synopsis/status/when on the units', async() => {
    // Cost: light (~1 turn). The corkboard, outline, and timeline render
    // from unit meta — a project agents cannot annotate is a project the
    // writer cannot see.
    const harness = await make({ label: 'flow-22-view-meta' })
    harness.setMode('auto')
    await harness.send(
      't-viewmeta',
      'Fill in the binder info for BOTH scenes in chapter one: a one-line synopsis, a ' +
        'status (draft), and a story-time `when` value for each. Use the metadata tools — ' +
        'do not touch the prose.'
    )
    const usedMetaTool = harness.activity.some((event) =>
      /update_unit_meta/.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(usedMetaTool).toBe(true)
    const { structureService } = await import('../../src/main/services/novel/StructureService')
    const structure = await structureService.loadReconciled(harness.root)
    const scenes = structure.units[0]?.children ?? []
    expect(scenes.length).toBeGreaterThanOrEqual(2)
    const annotated = scenes.filter((scene) => (scene.synopsis ?? '').trim().length > 0)
    expect(annotated.length).toBeGreaterThanOrEqual(2)
    expect(scenes.some((scene) => (scene.when ?? '').trim().length > 0)).toBe(true)
    expect(scenes.some((scene) => (scene.status ?? '').trim().length > 0)).toBe(true)
  })
})

live('23 · locked bible pages are immutable to agents, live', () => {
  it('an update request against locked canon changes nothing on disk', async() => {
    // Cost: light (1 turn). locked: true front matter must hold on EVERY
    // route — direct edits, generic propose_* tools, and the apply gate.
    const harness = await make({ label: 'flow-23-locked' })
    const lockedPath = path.join(harness.root, 'bible/characters/elias.md')
    const lockedContent =
      '---\nlocked: true\naliases: [Elias]\n---\n\n# Elias Crane\n\nEyes: brown. The drowned brother.\n'
    fs.mkdirSync(path.dirname(lockedPath), { recursive: true })
    fs.writeFileSync(lockedPath, lockedContent)

    harness.setMode('auto')
    const reply = await harness.send(
      't-locked',
      'Update the bible page for Elias Crane: change his eye colour to green.'
    )
    // The page is byte-identical — no route wrote to it.
    expect(fs.readFileSync(lockedPath, 'utf8')).toBe(lockedContent)
    // And no proposal targets the locked page (proposal CREATION throws).
    const touching = harness.editProposals.filter((proposal) =>
      JSON.stringify(proposal).includes('elias')
    )
    expect(touching).toHaveLength(0)
    // The writer gets an honest explanation, not silence.
    expect(reply.toLowerCase()).toMatch(/locked|immutable|cannot|can't|not able|protect/)
  })
})

live('24 · biscuit.md standing instructions steer the prose', () => {
  it('a distinctive standing rule shows up in drafted prose', async() => {
    // Cost: light (1 turn). biscuit.md rides every brief verbatim — the
    // writer's standing instructions must actually bind.
    const harness = await make({ label: 'flow-24-biscuit' })
    fs.writeFileSync(
      path.join(harness.root, 'biscuit.md'),
      '# Standing instructions\n\n' +
        'The town in this novel is ALWAYS spelled "Amityville-on-Sea" — never plain ' +
        'Amityville. This is non-negotiable house style.\n'
    )
    harness.setMode('auto')
    await harness.send(
      't-biscuit',
      'Draft a 3-sentence scene where Zara drives into the town at dusk, and add it to ' +
        'chapter one as a new scene.'
    )
    expect(harness.editProposals.length).toBeGreaterThanOrEqual(1)
    const prose = JSON.stringify(harness.editProposals)
    expect(prose).toContain('Amityville-on-Sea')
  })
})

live('25 · continuity lifecycle: contradiction found, filed, fix proposed', () => {
  it('an auditor logs the issue; the fix turn proposes the correction', async() => {
    // Cost: light-medium (2 turns).
    const harness = await make({ label: 'flow-25-continuity' })
    fs.writeFileSync(
      path.join(harness.root, 'manuscript/chapter-one/the-mirror.md'),
      'In the mirror Zara caught her own green eyes, tired and rimmed red.\n'
    )
    harness.setMode('auto')
    await harness.send(
      't-continuity',
      'Run a continuity check on Zara Voss across the whole manuscript — eye colour ' +
        'especially — and file any contradiction you can prove with quotes.'
    )
    const issuesPath = path.join(harness.root, '.wordbird/continuity/issues.json')
    expect(fs.existsSync(issuesPath)).toBe(true)
    // issues.json holds a BARE ARRAY on disk (ContinuityService.save writes
    // `IContinuityIssue[]`; only the IPC layer wraps it as `{ issues }`).
    // Reading it as the wrapped shape made this throw a TypeError on
    // `undefined.filter` the moment the agent actually logged something —
    // i.e. it could only "pass" while the feature under test did nothing.
    const parsed = JSON.parse(fs.readFileSync(issuesPath, 'utf8'))
    const logged = (Array.isArray(parsed) ? parsed : parsed.issues ?? []) as Array<{
      status: string
    }>
    const open = logged.filter((issue) => issue.status === 'open')
    expect(
      open.length,
      `no open issue was filed. On disk: ${JSON.stringify(parsed).slice(0, 300)}`
    ).toBeGreaterThanOrEqual(1)

    await harness.send(
      't-continuity',
      'The bible is right: her eyes are grey. Propose the prose fix for the mirror scene.'
    )
    const fixes = harness.editProposals.filter((proposal) => {
      const text = JSON.stringify(proposal).toLowerCase()
      return text.includes('mirror') && text.includes('grey')
    })
    expect(fixes.length).toBeGreaterThanOrEqual(1)
  })
})

live('26 · outline-first writers get structure before prose', () => {
  it('records outline-first and produces planning artifacts, not free drafting', async() => {
    // Cost: MEDIUM-HEAVY. The counterpart to flow 8 (discovery): methods are
    // DEFAULTS that must actually branch behavior. "Build the whole outline for
    // a novella" is real structural work — the model lays down a multi-scene
    // skeleton (often a worker wave), which routinely runs past the default
    // 300s vitest timeout, so this flow sets its own generous budget.
    const harness = await make({ root: createEmptyLiveProject(), label: 'flow-26-outline' })
    harness.setMode('auto')
    await harness.send(
      't-outline',
      'I am an outline-first writer — I need the whole skeleton before I draft a word. ' +
        'Set my project up for a locked-room mystery novella and remember how I work.'
    )
    await harness.send(
      't-outline',
      'Premise: a snowed-in mountain observatory, five staff, one body, no footprints. ' +
        'Three-act structure. Go ahead and build the outline — do NOT draft prose yet.'
    )
    const meta = JSON.parse(
      fs.readFileSync(path.join(harness.root, '.wordbird', 'project.json'), 'utf8')
    ) as { planningStyle?: string }
    expect(meta.planningStyle).toBe('outline-first')
    // Structural artifacts exist: a multi-unit skeleton, a beat sheet, or a plan.
    const structurePath = path.join(harness.root, '.wordbird', 'structure.json')
    interface UnitLike {
      children?: UnitLike[]
    }
    const countLeaves = (units: UnitLike[]): number =>
      units.reduce((sum, u) => sum + (u.children ? countLeaves(u.children) : 1), 0)
    const leafCount = fs.existsSync(structurePath)
      ? countLeaves((JSON.parse(fs.readFileSync(structurePath, 'utf8')) as { units: UnitLike[] }).units)
      : 0
    const beatSheet = fs.existsSync(path.join(harness.root, 'bible', 'structure.md'))
    const plansDir = path.join(harness.root, 'plans')
    const hasPlan = fs.existsSync(plansDir) && fs.readdirSync(plansDir).length > 0
    expect(leafCount >= 3 || beatSheet || hasPlan).toBe(true)
  }, 900_000)
})

liveHeavy('27 · sweeping revision: remove a character end to end — HEAVY', () => {
  it('start_revision + impact map + proposals across the affected scenes', async() => {
    // Cost: heavy (1 turn + worker wave). The UPDATE pillar: the
    // RevisionService flow had zero live coverage before this.
    const harness = await make({ label: 'flow-27-revision', turnBudget: 40 })
    fs.writeFileSync(
      path.join(harness.root, 'manuscript/chapter-one/the-visitor.md'),
      'Marcus Hale leaned on the doorframe, rain dripping from his coat. Zara let him in ' +
        'against her better judgment. Marcus always brought bad news wrapped in a smile.\n'
    )
    fs.writeFileSync(
      path.join(harness.root, 'bible/characters/marcus.md'),
      '---\naliases: [Marcus, Marcus Hale]\n---\n\n# Marcus Hale\n\nAn informant. Brings bad news.\n'
    )
    harness.setMode('auto')
    // The revision playbook (Orchestrator SWEEPING REVISIONS) INTERVIEWS the
    // writer first — name/aliases, who inherits orphaned plot functions, delete
    // vs rewrite policy, tone — and only THEN calls start_revision. To exercise
    // the revision MACHINERY in one turn (the interview branch is covered by
    // flow 10), the message supplies every one of those answers up front and
    // tells the supervisor not to interview. Without this the model correctly
    // asks and stops, and start_revision never fires this turn.
    await harness.send(
      't-revision',
      'Remove the character Marcus Hale (aliases: Marcus, Marcus Hale) from the story ' +
        'ENTIRELY — a sweeping, book-wide revision. Here is the COMPLETE directive so you ' +
        'have everything you need: nobody inherits his role — simply cut his contributions; ' +
        'REWRITE affected scenes to remove him (do NOT delete whole scenes); keep the ' +
        'existing tone. You have the full directive — do NOT interview me, proceed NOW: ' +
        'call start_revision with this directive, map the impact, and propose the prose changes.'
    )
    // The revision machinery actually ran (not an ad-hoc edit).
    const revisionActivity = harness.activity.some((event) =>
      /start_revision|update_impact_map|mark_revision_unit/.test(
        `${event.label} ${event.detail ?? ''}`
      )
    )
    const revisionsDir = path.join(harness.root, '.wordbird', 'revisions')
    const revisionOnDisk =
      fs.existsSync(revisionsDir) && fs.readdirSync(revisionsDir).length > 0
    expect(revisionActivity || revisionOnDisk).toBe(true)
    // The affected scene got a concrete prose proposal.
    const touching = harness.editProposals.filter((proposal) =>
      JSON.stringify(proposal).toLowerCase().includes('visitor')
    )
    expect(touching.length).toBeGreaterThanOrEqual(1)
  }, 600_000)
})

liveOpenRouterOnly('28 · mid-run steering reaches the model (LangGraph path)', () => {
  it('a queued steer note is honored in the same turn', async() => {
    // Cost: light (~2 turns). Steering delivery mechanics are unit-pinned
    // (orchestrator-interrupt.spec); this proves a REAL model receives and
    // honors the note. Timing-safe: the note is queued BEFORE the send, so
    // the first supervisor boundary drains it deterministically.
    const harness = await make({ label: 'flow-28-steer' })
    harness.setMode('ask')
    harness.queueSteering(
      'IMPORTANT mid-run note: whatever you were asked, end your reply with the ' +
        'exact word BREADCRUMB.'
    )
    const reply = await harness.send(
      't-steer',
      'In one sentence, what colour are Zara Voss’s eyes according to the bible?'
    )
    expect(reply).toMatch(/grey|gray/i)
    expect(reply.toUpperCase()).toContain('BREADCRUMB')
  })
})

liveOpenRouterOnly('29 · per-agent pause/resume (LangGraph capability)', () => {
  it('a running worker pauses at its step boundary and resumes to completion', async() => {
    // Cost: light-medium (1 turn + wave). perAgentControl is LangGraph-only
    // (the SDK runtime hides these controls) — so this flow is openrouter-
    // gated and always runs in CI, never billing the subscription.
    const harness = await make({ label: 'flow-29-pause' })
    harness.setMode('ask')
    const pending = harness.send(
      't-pause',
      'Spawn one explorer to list every scene with a one-line description each. ' +
        'Spawn the agent to do it.'
    )
    // Catch the worker while it runs.
    const runningAgent = async(): Promise<string | null> => {
      const running = harness.agentStatuses.find((s) => s.status === 'running')
      return running?.agentId ?? null
    }
    let agentId: string | null = null
    await expect
      .poll(async() => (agentId = await runningAgent()), { timeout: 120_000 })
      .not.toBeNull()

    const orchestrator = harness.orchestrator!
    expect(orchestrator.pauseAgent(agentId!)).toBe(true)
    await expect
      .poll(
        () => harness.agentStatuses.filter((s) => s.agentId === agentId).some((s) => s.paused),
        { timeout: 30_000 }
      )
      .toBe(true)

    expect(orchestrator.resumeAgent(agentId!)).toBe(true)
    const reply = await pending
    // The run completed after resume, with the worker finishing its job.
    expect(reply.length).toBeGreaterThan(20)
    const finished = harness.agentStatuses.filter(
      (s) => s.agentId === agentId && s.status === 'done'
    )
    expect(finished.length).toBeGreaterThanOrEqual(1)
  }, 300_000)
})

live('30 · bible auto-injection: canon reaches the model without a tool round-trip', () => {
  it('a bible-only detail is answered correctly with the page auto-injected', async() => {
    // Cost: light (1 turn). Codex-style auto-injection (SOTA feature 1):
    // a detail that lives ONLY in the bible page (never in prose) is
    // inlined into the brief when the writer mentions the character, so
    // the model can answer WITHOUT a read_bible round-trip. We assert the
    // answer is correct (the writer-facing value); whether the model also
    // called a tool is model-dependent and not asserted.
    const harness = await make({ label: 'flow-30-lore' })
    const biblePath = path.join(harness.root, 'bible', 'characters', 'zara.md')
    // Overwrite the seeded page with a distinctive, prose-absent detail.
    fs.writeFileSync(
      biblePath,
      '---\naliases: [Zara, Detective Voss]\n---\n# Zara Voss\n\n' +
        'Eyes: grey. Distinguishing mark: a crescent-moon scar on her right wrist ' +
        'from a childhood accident with a fishing hook.\n'
    )
    harness.setMode('ask')
    const reply = await harness.send(
      't-lore',
      'One sentence: what is Zara Voss’s distinguishing mark?'
    )
    expect(reply.toLowerCase()).toMatch(/crescent|moon|scar|wrist/)
  })
})

live('31 · voice exemplars reach the drafting context', () => {
  it('the writer’s voice sample is available to the model in-context', async() => {
    // Cost: light (1 turn). Voice priming (SOTA feature 2): the writer's
    // own prose in bible/voice/ is inlined into the brief so drafters can
    // match it. We prove the exemplar is IN context by asking the model to
    // quote its distinctive signature (the mechanism; emulation quality is
    // model-dependent and not asserted).
    const harness = await make({ label: 'flow-31-voice' })
    fs.mkdirSync(path.join(harness.root, 'bible', 'voice'), { recursive: true })
    fs.writeFileSync(
      path.join(harness.root, 'bible', 'voice', 'signature.md'),
      'The harbour wore its fog like a borrowed coat, salt-grey and two sizes too big.\n'
    )
    harness.setMode('ask')
    const reply = await harness.send(
      't-voice',
      'Quote the exact distinctive phrase from my voice exemplars that describes the fog.'
    )
    expect(reply.toLowerCase()).toMatch(/borrowed coat|salt-grey|two sizes too big/)
  })
})

live('32 · anti-slop: the corpus lint catches a cross-scene echo', () => {
  it('a phrase repeated across scenes is surfaced by lint_prose corpus:true', async() => {
    // Cost: light (1 turn). Anti-slop gate (SOTA feature 3): seed an
    // obvious AI-tell — the same phrase opening several scenes — and ask
    // the model to run the corpus check and report it. Proves the tool
    // works end-to-end against a real model.
    const harness = await make({ label: 'flow-32-slop' })
    const echo = 'A shiver ran down her spine'
    const scenes: Array<[string, string]> = [
      ['manuscript/chapter-one/the-alley.md', `${echo} as Zara entered the alley.`],
      ['manuscript/chapter-one/the-letter.md', `${echo} when she read the letter.`],
      ['manuscript/chapter-two/the-vault.md', `${echo} at the sight of the empty vault.`],
      ['manuscript/chapter-two/the-rooftop.md', `${echo} on the windswept rooftop.`]
    ]
    for (const [rel, text] of scenes) {
      fs.mkdirSync(path.dirname(path.join(harness.root, rel)), { recursive: true })
      fs.writeFileSync(path.join(harness.root, rel), text + '\n')
    }
    harness.setMode('ask')
    const reply = await harness.send(
      't-slop',
      'Run an anti-slop check across the whole manuscript (lint_prose corpus:true) and ' +
        'tell me the exact phrase that repeats across scenes.'
    )
    expect(reply.toLowerCase()).toContain('shiver')
    // A corpus lint tool call actually happened.
    const usedCorpusLint = harness.activity.some((event) =>
      /lint_prose/.test(`${event.label} ${event.detail ?? ''}`)
    )
    expect(usedCorpusLint).toBe(true)
  })
})

live('33 · craft fields: the agent sets goal/conflict/outcome via update_unit_meta', () => {
  it('a scene-craft request lands the fields on the unit', async() => {
    // Cost: light (1 turn). Per-scene craft fields (SOTA batch-2): the
    // model records yWriter/Story-Grid structure through update_unit_meta
    // and it persists to structure.json.
    const harness = await make({ label: 'flow-33-craft' })
    harness.setMode('auto')
    await harness.send(
      't-craft',
      'For the opening alley scene, fill in the scene craft: the goal, the conflict, ' +
        'the outcome, and the Story Grid value shift. Use the metadata tool.'
    )
    const { structureService, collectLeaves } = await import(
      '../../src/main/services/novel/StructureService'
    )
    const structure = await structureService.loadReconciled(harness.root)
    // Robust to which scene / any restructuring: SOME scene must carry
    // ≥2 craft fields — the claim is the agent set them through the tool.
    const best = collectLeaves(structure.units)
      .map(
        (u) =>
          [u.goal, u.conflict, u.outcome, u.valueShift].filter((v) => (v ?? '').trim().length > 0)
            .length
      )
      .reduce((a, b) => Math.max(a, b), 0)
    expect(best).toBeGreaterThanOrEqual(2)
  })
})

live('34 · character interview: the model answers in the character’s voice', () => {
  it('an interview request is grounded in the bible and answered in-character', async() => {
    // Cost: light (1-2 turns). Character-interview persona (SOTA batch-2):
    // the model reads the character's bible page + facts and speaks AS
    // them. We seed a distinctive, checkable belief and confirm it surfaces
    // in first-person voice.
    const harness = await make({ label: 'flow-34-persona' })
    fs.writeFileSync(
      path.join(harness.root, 'bible', 'characters', 'zara.md'),
      '---\naliases: [Zara, Detective Voss]\n---\n# Zara Voss\n\n' +
        'A hard-bitten skeptic. She believes the harbour fog hides more than it reveals, ' +
        'and she never, ever trusts a man in a grey coat.\n'
    )
    harness.setMode('ask')
    const reply = await harness.send(
      't-persona',
      'Let me interview Zara Voss. Zara — how do you feel about men in grey coats? ' +
        'Answer in your own voice, first person.'
    )
    // In-character (first person) and reflecting the seeded belief.
    expect(reply.toLowerCase()).toMatch(/grey coat|gray coat|trust|never/)
    expect(reply.toLowerCase()).toMatch(/\bi\b|\bme\b|\bmy\b/)
  })
})

live('35 · retro-outline: the model derives synopsis + craft from existing prose', () => {
  it('outlining written scenes fills metadata without proposing prose', async() => {
    // Cost: light-medium (1-2 turns). Retro-outline (SOTA batch-2): a
    // pantser asks for the map to catch up to the prose; the model reads
    // each scene and fills synopsis/craft via update_unit_meta — metadata
    // only, no prose proposals.
    const harness = await make({ label: 'flow-35-retro' })
    harness.setMode('auto')
    await harness.send(
      't-retro',
      'I write by discovery and never outlined. Outline what I have already written: ' +
        'fill in each scene’s synopsis. Do not write any new prose.'
    )
    const { structureService, collectLeaves } = await import(
      '../../src/main/services/novel/StructureService'
    )
    const structure = await structureService.loadReconciled(harness.root)
    const withSynopsis = collectLeaves(structure.units).filter(
      (u) => (u.synopsis ?? '').trim().length > 0
    )
    // At least one existing scene got a derived synopsis.
    expect(withSynopsis.length).toBeGreaterThanOrEqual(1)
    // Metadata-only: no prose edit proposals were raised.
    expect(harness.editProposals.length).toBe(0)
  })
})

live('36 · relationship map: the agent generates a mermaid graph from the ledger', () => {
  it('recorded inter-character facts become a proposed relationships.md', async() => {
    // Cost: light-medium (1-2 turns). Relationship map (SOTA batch-2): the
    // model records inter-character facts and runs relationship_map, which
    // deterministically proposes a mermaid graph for review.
    const harness = await make({ label: 'flow-36-relmap' })
    // Seed two entities so the map has nodes to connect.
    fs.writeFileSync(
      path.join(harness.root, 'bible', 'characters', 'zara.md'),
      '---\naliases: [Zara]\n---\n# Zara Voss\n\nA detective.\n'
    )
    fs.writeFileSync(
      path.join(harness.root, 'bible', 'characters', 'mara.md'),
      '---\naliases: [Mara]\n---\n# Mara Voss\n\nZara’s long-lost sister.\n'
    )
    harness.setMode('auto')
    await harness.send(
      't-relmap',
      'Record the fact that Zara and Mara are sisters, then generate the relationship map.'
    )
    // A relationships.md proposal with a mermaid graph was raised.
    const proposals = harness.editProposals.map((p) => JSON.stringify(p))
    const relMapProposal = proposals.find(
      (p) => p.includes('relationships.md') && p.includes('mermaid')
    )
    expect(relMapProposal).toBeTruthy()
    expect(relMapProposal!.toLowerCase()).toContain('sister')
  })
})

live('37 · bible extraction: an imported manuscript yields review-gated bible pages', () => {
  it('extracting canon from imported prose proposes character pages', async() => {
    // Cost: light-medium (1 turn + steward wave). POST-IMPORT bible
    // extraction (SOTA batch-3): a manuscript exists with recurring names
    // but no canon; the model mines them and PROPOSES bible pages
    // (review-gated), never fabricating traits beyond the prose.
    const os = await import('os')
    const fsm = await import('fs')
    const pathm = await import('path')
    const root = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'wordbird-live-import-'))
    fsm.mkdirSync(pathm.join(root, '.wordbird'), { recursive: true })
    fsm.writeFileSync(
      pathm.join(root, '.wordbird', 'project.json'),
      JSON.stringify({ name: 'Imported', flavor: 'chapters-scenes', importedFrom: 'draft.md' })
    )
    const write = (rel: string, text: string): void => {
      const target = pathm.join(root, rel)
      fsm.mkdirSync(pathm.dirname(target), { recursive: true })
      fsm.writeFileSync(target, text)
    }
    // Prose where "Odalys Finch" recurs — an obvious extraction target.
    write(
      'manuscript/chapter-one/opening.md',
      'Odalys Finch climbed the lighthouse stairs. Odalys had kept the light for thirty years.'
    )
    write(
      'manuscript/chapter-one/storm.md',
      'The storm came. Odalys Finch lashed the door and waited. Finch did not sleep.'
    )

    const harness = await make({ root, label: 'flow-37-extract' })
    harness.setMode('auto')
    await harness.send(
      't-extract',
      'This is an imported manuscript. Extract the story bible: propose a page for the ' +
        'recurring character so future work stays consistent.'
    )
    // A bible page for Odalys was proposed through the review queue.
    const bibleProposal = harness.editProposals
      .map((p) => JSON.stringify(p))
      .find((p) => /bible\/.*\.md/.test(p) && /odalys|finch/i.test(p))
    expect(bibleProposal).toBeTruthy()
    fsm.rmSync(root, { recursive: true, force: true })
  })
})

live('38 · scene-beat drafting: a terse beat expands into a review-gated passage', () => {
  it('drafting a beat proposes prose substantially longer than the beat', async() => {
    // Cost: light (1 turn). Scene-beat drafting (SOTA batch-4): the
    // SelectionActions "Draft" affordance sends a beat-expansion request;
    // the model turns a terse beat into a full passage, review-gated. We
    // send the same instruction shape and assert a same-file prose
    // proposal much longer than the input beat.
    const harness = await make({ label: 'flow-38-beat' })
    const beat = 'Zara finds a brass key hidden under the jetty and realizes what it opens.'
    const scenePath = path.join(harness.root, 'manuscript', 'chapter-one', 'the-alley.md')
    fs.writeFileSync(scenePath, beat + '\n')
    harness.setMode('auto')
    await harness.send(
      't-beat',
      'Draft this BEAT into full prose in manuscript/chapter-one/the-alley.md — expand ' +
        `this terse note into a finished passage matching the voice, then replace it. Beat: "${beat}". ` +
        'Propose the change with propose_project_file_edit.'
    )
    expect(harness.editProposals.length).toBeGreaterThanOrEqual(1)
    const proposal = JSON.stringify(harness.editProposals[0])
    // The drafted prose is meaningfully longer than the one-line beat and
    // keeps the beat's concrete content.
    const newContent =
      (harness.editProposals[0] as { edit?: { newContent?: string } }).edit?.newContent ?? ''
    expect(newContent.length).toBeGreaterThan(beat.length * 2)
    expect(proposal.toLowerCase()).toMatch(/key|jetty/)
  })
})
