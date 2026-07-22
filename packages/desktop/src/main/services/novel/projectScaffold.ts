/**
 * Per-flavor novel project scaffolding — the folders and seed files written
 * at project creation. All flavors share the story bible and notes; they
 * differ only in how prose files are laid out on disk (see
 * @shared/types/novel for the flavor descriptions).
 *
 * Pure data, deliberately outside the IPC layer: the style template is a
 * prompt-visible artifact (every drafter reads bible/style.md), so it is
 * unit-tested directly rather than through an Electron handler.
 */

import type { ProjectFlavor } from '@shared/types/novel'

export const COMMON_FOLDERS = [
  'skills',
  'bible/characters',
  'bible/places',
  'bible/threads',
  'bible/research',
  // Voice exemplars (the writer's OWN prose) are the strongest lever
  // against every project sounding alike — scaffold the folder so the
  // onboarding playbook has somewhere to put them.
  'bible/voice',
  'notes'
]

/**
 * PLACEHOLDERS ARE COMMENTS, DELIBERATELY. Parenthetical examples written as
 * prose ("- Narrator voice: (e.g. wry, restrained)") are read by the drafting
 * models as the actual instruction — every project that never filled this in
 * drafted against the SAME voice directive, which is what made unrelated
 * novels read alike (no cross-project memory required). HTML comments
 * carry the guidance to the writer without asserting canon; an unfilled field
 * is then honestly blank, and ProjectHealth's `style-unfilled` check flags it.
 */
export const STYLE_TEMPLATE =
  '# Style Guide\n\n' +
  '<!-- Fill the fields below in your own words. While they are blank,\n' +
  '     Biscuit drafts in the model default voice. Examples are kept in\n' +
  '     comments so they are never mistaken for your choices. -->\n\n' +
  '## Voice & tense\n\n' +
  '- Point of view:\n- Tense:\n- Narrator voice:\n' +
  '<!-- e.g. third limited, single POV per scene | past | wry, restrained -->\n\n' +
  '## Prose rules\n\n' +
  '- Dialogue tags:\n- Words/phrases to avoid:\n- Profanity/content boundaries:\n' +
  '<!-- e.g. said/asked only | suddenly, very, "little did they know" -->\n\n' +
  '## Character voices\n\n' +
  '<!-- One bullet per character: speech habits, vocabulary, rhythm. -->\n'

// Boilerplate diet: guidance lives in the views' empty states now, not
// in scaffolded READMEs the writer has to delete.
export const COMMON_FILES: Record<string, string> = {
  'bible/style.md': STYLE_TEMPLATE,
  // Compiled output and agent thread state are derived/machine-local —
  // keep them out of snapshots.
  '.gitignore': 'exports/\n.wordbird/agent-state/\n'
}

export const FLAVOR_TEMPLATES: Record<
  ProjectFlavor,
  { folders: string[]; files: Record<string, string> }
> = {
  // No placeholder chapters/scenes: the binder starts empty and the first
  // unit is the writer's (or Biscuit's onboarding playbook's) to create.
  'chapters-scenes': {
    folders: [...COMMON_FOLDERS, 'manuscript'],
    files: { ...COMMON_FILES }
  },
  'scene-pool': {
    folders: [...COMMON_FOLDERS, 'scenes'],
    files: { ...COMMON_FILES }
  },
  flat: {
    folders: [...COMMON_FOLDERS],
    files: { ...COMMON_FILES }
  }
}
