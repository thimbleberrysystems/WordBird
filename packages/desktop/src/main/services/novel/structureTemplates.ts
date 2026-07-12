/**
 * Story-structure beat-sheet templates, written to `bible/structure.md` when
 * the writer picks a framework (at project creation or later via Biscuit's
 * set_writing_method). Plain writer-editable markdown: beats are checklist
 * items agents tick (`- [x]`) as scenes cover them, and the ~percentages are
 * diagnostic pacing targets to report against — never rules to enforce.
 *
 * Sources: Three-Act (classic), Blake Snyder's Save the Cat (15 beats),
 * Vogler's 12-stage Hero's Journey, Dan Wells' Seven-Point structure,
 * Gwen Hayes' Romancing the Beat.
 */

import type { StructureTemplate } from '../../../shared/types/novel'

const HEADER = (title: string): string =>
  `# Structure: ${title}\n\n` +
  'This beat sheet is yours — rename, delete, or reorder beats freely.\n' +
  'Biscuit maps scenes to beats, ticks them off as they are covered, and\n' +
  'reports pacing against the ~targets. Targets are lenses, not laws.\n\n'

export const STRUCTURE_TEMPLATES: Partial<Record<StructureTemplate, string>> = {
  'three-act': HEADER('Three-Act') +
    '## Act I — Setup (~25%)\n' +
    '- [ ] Opening image / ordinary world\n' +
    '- [ ] Inciting incident (~12%)\n' +
    '- [ ] First plot point — no way back (~25%)\n\n' +
    '## Act II — Confrontation (~50%)\n' +
    '- [ ] First pinch point — antagonist pressure (~37%)\n' +
    '- [ ] Midpoint — shift from reaction to action (~50%)\n' +
    '- [ ] Second pinch point — the cost becomes clear (~62%)\n' +
    '- [ ] Second plot point — final piece of the puzzle (~75%)\n\n' +
    '## Act III — Resolution (~25%)\n' +
    '- [ ] Climax (~90%)\n' +
    '- [ ] Resolution / closing image\n',

  'save-the-cat': HEADER('Save the Cat (15 beats)') +
    '- [ ] Opening Image (~1%)\n' +
    '- [ ] Theme Stated (~5%)\n' +
    '- [ ] Set-Up (~1–10%)\n' +
    '- [ ] Catalyst (~10%)\n' +
    '- [ ] Debate (~10–20%)\n' +
    '- [ ] Break into Two (~20%)\n' +
    '- [ ] B Story (~22%)\n' +
    '- [ ] Fun and Games / promise of the premise (~20–50%)\n' +
    '- [ ] Midpoint — false victory or false defeat (~50%)\n' +
    '- [ ] Bad Guys Close In (~50–75%)\n' +
    '- [ ] All Is Lost (~75%)\n' +
    '- [ ] Dark Night of the Soul (~75–80%)\n' +
    '- [ ] Break into Three (~80%)\n' +
    '- [ ] Finale (~80–99%)\n' +
    '- [ ] Final Image (~100%)\n',

  'heros-journey': HEADER("Hero's Journey (12 stages)") +
    '## Departure\n' +
    '- [ ] Ordinary World\n' +
    '- [ ] Call to Adventure\n' +
    '- [ ] Refusal of the Call\n' +
    '- [ ] Meeting the Mentor\n' +
    '- [ ] Crossing the First Threshold (~25%)\n\n' +
    '## Initiation\n' +
    '- [ ] Tests, Allies, Enemies\n' +
    '- [ ] Approach to the Inmost Cave\n' +
    '- [ ] The Ordeal (~50%)\n' +
    '- [ ] Reward — seizing the sword\n\n' +
    '## Return\n' +
    '- [ ] The Road Back (~75%)\n' +
    '- [ ] Resurrection — final test (~90%)\n' +
    '- [ ] Return with the Elixir\n',

  'seven-point': HEADER('Seven-Point (work backwards from the resolution)') +
    '- [ ] Hook — the starting state, opposite of the resolution (~0%)\n' +
    '- [ ] Plot Turn 1 — the call that starts the journey (~12%)\n' +
    '- [ ] Pinch Point 1 — apply pressure, introduce the villain (~37%)\n' +
    '- [ ] Midpoint — from reaction to action (~50%)\n' +
    '- [ ] Pinch Point 2 — the worst blow; all seems lost (~62%)\n' +
    '- [ ] Plot Turn 2 — the final piece: "the power was in you all along" (~75%)\n' +
    '- [ ] Resolution — the climax everything aimed at (~90%)\n',

  'romancing-the-beat': HEADER('Romancing the Beat (romance arc)') +
    '## Phase 1 — Set Up\n' +
    '- [ ] Introduce hero/heroine in their incomplete "before" lives\n' +
    '- [ ] Meet Cute (~10%)\n' +
    '- [ ] No Way #1 — resisting the attraction\n\n' +
    '## Phase 2 — Falling In Love\n' +
    '- [ ] The Adhesion — a reason they must stay together (~25%)\n' +
    '- [ ] Getting to know you / deepening attraction\n' +
    '- [ ] Midpoint of Love — maybe this could work (~50%)\n' +
    '- [ ] The Inkling of Doubt\n\n' +
    '## Phase 3 — Retreating From Love\n' +
    '- [ ] Deepening Doubt — old wounds resurface\n' +
    '- [ ] Break Up / Black Moment — all is lost (~75%)\n\n' +
    '## Phase 4 — Fighting For Love\n' +
    '- [ ] The Wake-Up — realizing what matters\n' +
    '- [ ] Grand Gesture (~90%)\n' +
    '- [ ] Whole-Hearted Happily Ever After\n'
}

/** Human labels for prompts/UI mirrors (locales own the translated ones). */
export const STRUCTURE_TEMPLATE_LABELS: Record<StructureTemplate, string> = {
  freeform: 'Freeform (no template)',
  'three-act': 'Three-Act',
  'save-the-cat': 'Save the Cat',
  'heros-journey': "Hero's Journey",
  'seven-point': 'Seven-Point',
  'romancing-the-beat': 'Romancing the Beat',
  unset: 'Decide later'
}
