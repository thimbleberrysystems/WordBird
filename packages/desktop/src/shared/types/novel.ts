/**
 * Novel project model — shared between main and renderer.
 *
 * A WordBird novel project is plain markdown on disk plus a structure
 * manifest at `.wordbird/structure.json`. The manifest is the single
 * source of truth for ORDER and unit metadata; file names stay stable so
 * reordering never renames files.
 *
 * Three on-disk flavors share one logical model (an ordered tree of prose
 * units + a bible):
 *   - 'chapters-scenes' : manuscript/part-N/ch-N/scene-N.md  (Scrivener-style)
 *   - 'scene-pool'      : a flat scenes/ folder, grouping lives in the manifest
 *   - 'flat'            : one markdown file per chapter at the project root
 */

export type ProjectFlavor = 'chapters-scenes' | 'scene-pool' | 'flat'

export type NovelUnitType = 'part' | 'chapter' | 'scene'

export type NovelUnitStatus = 'idea' | 'draft' | 'revised' | 'final'

export interface INovelUnit {
  /** Stable identifier (uuid). Never derived from title or path. */
  id: string
  type: NovelUnitType
  title: string
  /**
   * Project-relative markdown file backing this unit. Present on leaf
   * units (scenes, or chapters in the 'flat' flavor); absent on
   * structural containers (parts, chapters with scene children).
   */
  path?: string
  status?: NovelUnitStatus
  /** Point-of-view character name (yWriter-style optional metadata). */
  pov?: string
  location?: string
  synopsis?: string
  /** Cached word count of the backing file (leaf units only). */
  wordCount?: number
  children?: INovelUnit[]
}

export interface INovelSeparators {
  /** Inserted between scenes inside the same chapter. */
  scene?: string
  /** Heading level used for chapter titles at compile time (0 = omit). */
  chapterHeadingLevel?: number
  /** Heading level used for part titles at compile time (0 = omit). */
  partHeadingLevel?: number
}

export interface INovelStructure {
  version: 1
  flavor: ProjectFlavor
  units: INovelUnit[]
  separators?: INovelSeparators
}

export interface INovelCreateUnitPayload {
  /** Parent unit id, or null to create at the top level. */
  parentId: string | null
  type: NovelUnitType
  title: string
  /** Insert position among siblings; append when omitted. */
  index?: number
}

export interface INovelUnitUpdate {
  title?: string
  status?: NovelUnitStatus
  pov?: string
  location?: string
  synopsis?: string
}

export interface INovelCompileOptions {
  /** Include scene titles as headings (default false — scenes flow as prose). */
  includeSceneTitles?: boolean
  separators?: INovelSeparators
  /** When set, also write the compiled manuscript to this absolute path. */
  outputPath?: string
}

export interface INovelCompileResult {
  ok: boolean
  content?: string
  outputPath?: string
  wordCount?: number
  error?: string
}

export interface INovelStructureResult {
  ok: boolean
  structure?: INovelStructure
  error?: string
}

/** A content checkpoint ("snapshot") — a friendly wrapper over a git commit. */
export interface ISnapshotInfo {
  id: string
  message: string
  /** Unix ms. */
  timestamp: number
  /** True when the snapshot was taken automatically around an agent task. */
  auto?: boolean
}

export interface ISnapshotListResult {
  ok: boolean
  snapshots?: ISnapshotInfo[]
  error?: string
}

export interface ISnapshotActionResult {
  ok: boolean
  id?: string
  error?: string
}
