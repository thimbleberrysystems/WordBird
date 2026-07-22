/**
 * ManuscriptImporter — turn an existing manuscript (a single markdown
 * document) into a WordBird project: split it into chapters and scenes,
 * write the files, and build the binder. The strongest onboarding path
 * (Sudowrite "Import Novel") — a writer arrives with a finished draft and
 * WordBird takes it into the steward's care.
 *
 * The SPLIT is pure and deterministic (unit-tested); the WRITE side does
 * fs + StructureService. Bible extraction is a SEPARATE, review-gated
 * agent pass (POST-IMPORT playbook) — importing never fabricates canon.
 *
 * docx/HTML are out of scope here (docx needs a converter dependency;
 * HTML can be pre-converted with turndown by the caller). The split
 * operates on the markdown string, so those formats layer on cleanly.
 */

import path from 'path'
import fsPromises from 'fs/promises'
import type { ProjectFlavor } from '../../../shared/types/novel'
import { slugify } from './StructureService'
import { writeFileDurable } from '../../filesystem/atomic'

export interface ImportedScene {
  title: string
  content: string
}

export interface ImportedChapter {
  title: string
  scenes: ImportedScene[]
}

export interface ManuscriptSplit {
  chapters: ImportedChapter[]
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const SCENE_BREAK_RE = /^\s*(?:\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_|#{1,3}\s*\*\s*#{1,3})\s*$/

interface HeadingLine {
  level: number
  title: string
  index: number
}

const findHeadings = (lines: string[]): HeadingLine[] => {
  const headings: HeadingLine[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = HEADING_RE.exec(line)
    if (m) headings.push({ level: m[1].length, title: m[2].trim(), index: i })
  }
  return headings
}

/** Break a chapter body into scenes on horizontal-rule scene breaks. */
const splitOnSceneBreaks = (body: string): ImportedScene[] => {
  const lines = body.split('\n')
  const chunks: string[][] = [[]]
  let inFence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && SCENE_BREAK_RE.test(line)) {
      chunks.push([])
      continue
    }
    chunks[chunks.length - 1].push(line)
  }
  const scenes = chunks
    .map((c) => c.join('\n').trim())
    .filter((c) => c.length > 0)
    .map((content, i) => ({ title: `Scene ${i + 1}`, content }))
  return scenes
}

/**
 * Split a manuscript markdown document into chapters → scenes.
 *
 * Strategy: the SHALLOWEST heading level present is the chapter boundary.
 * Within a chapter, the next-deeper heading level (if any) marks scenes;
 * otherwise horizontal-rule scene breaks do; otherwise the chapter body
 * is a single scene. A document with no headings at all becomes one
 * chapter split on scene breaks (or one scene).
 */
export const splitManuscript = (markdown: string): ManuscriptSplit => {
  const text = markdown.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const headings = findHeadings(lines)

  // No headings → one untitled chapter, split on scene breaks.
  if (headings.length === 0) {
    const scenes = splitOnSceneBreaks(text)
    return {
      chapters: [
        { title: 'Chapter One', scenes: scenes.length > 0 ? scenes : [{ title: 'Scene 1', content: text.trim() }] }
      ]
    }
  }

  const chapterLevel = Math.min(...headings.map((h) => h.level))
  const chapterHeads = headings.filter((h) => h.level === chapterLevel)
  const deeperLevels = headings.filter((h) => h.level > chapterLevel).map((h) => h.level)
  const sceneLevel = deeperLevels.length > 0 ? Math.min(...deeperLevels) : null

  // Text before the FIRST chapter heading (title page, epigraph) belongs to
  // no chapter — prepend it to the first chapter's body so an import never
  // silently drops the writer's words.
  const docPreamble = lines.slice(0, chapterHeads[0].index)

  const chapters: ImportedChapter[] = []
  for (let c = 0; c < chapterHeads.length; c += 1) {
    const start = chapterHeads[c].index
    const end = c + 1 < chapterHeads.length ? chapterHeads[c + 1].index : lines.length
    const bodyLines =
      c === 0 ? [...docPreamble, ...lines.slice(start + 1, end)] : lines.slice(start + 1, end)
    const title = chapterHeads[c].title || `Chapter ${c + 1}`

    let scenes: ImportedScene[]
    if (sceneLevel !== null) {
      // Split the chapter body on scene-level headings.
      const bodyHeads = findHeadings(bodyLines).filter((h) => h.level === sceneLevel)
      if (bodyHeads.length === 0) {
        scenes = splitBodyIntoScenes(bodyLines.join('\n'))
      } else {
        scenes = []
        // Any text before the first scene heading is its own opening scene.
        const preamble = bodyLines.slice(0, bodyHeads[0].index).join('\n').trim()
        if (preamble) scenes.push({ title: 'Opening', content: preamble })
        for (let s = 0; s < bodyHeads.length; s += 1) {
          const sStart = bodyHeads[s].index
          const sEnd = s + 1 < bodyHeads.length ? bodyHeads[s + 1].index : bodyLines.length
          const content = bodyLines.slice(sStart + 1, sEnd).join('\n').trim()
          scenes.push({
            title: bodyHeads[s].title || `Scene ${s + 1}`,
            content
          })
        }
      }
    } else {
      scenes = splitBodyIntoScenes(bodyLines.join('\n'))
    }
    chapters.push({ title, scenes: scenes.length > 0 ? scenes : [{ title, content: '' }] })
  }
  return { chapters }
}

/** A chapter body with no scene headings: scene-break split, else one scene. */
const splitBodyIntoScenes = (body: string): ImportedScene[] => {
  const trimmed = body.trim()
  if (!trimmed) return []
  const scenes = splitOnSceneBreaks(body)
  return scenes.length > 1 ? scenes : [{ title: 'Scene 1', content: trimmed }]
}

/**
 * Filename slug for an imported chapter/scene. Delegates to the binder's
 * own slugify so imported paths match hand-created ones, adding only the
 * positional fallback an untitled heading needs ('chapter-3', 'scene-2').
 */
const slugFor = (title: string, fallback: string): string => {
  const slug = slugify(title)
  return slug === 'untitled' ? fallback : slug
}

export interface ImportResult {
  chapters: number
  scenes: number
  files: string[]
}

/**
 * Write a split manuscript into `root` as a chapters-scenes project,
 * then build structure.json. Assumes the project root exists with a
 * .wordbird/project.json marker. Returns a summary.
 */
export const writeImportedManuscript = async(
  root: string,
  split: ManuscriptSplit
): Promise<ImportResult> => {
  const files: string[] = []
  const usedChapterSlugs = new Set<string>()
  for (let c = 0; c < split.chapters.length; c += 1) {
    const chapter = split.chapters[c]
    const chapterBase = slugFor(chapter.title, `chapter-${c + 1}`)
    let chapterSlug = chapterBase
    let n = 2
    while (usedChapterSlugs.has(chapterSlug)) chapterSlug = `${chapterBase}-${n++}`
    usedChapterSlugs.add(chapterSlug)

    const usedSceneSlugs = new Set<string>()
    for (let s = 0; s < chapter.scenes.length; s += 1) {
      const scene = chapter.scenes[s]
      const sceneBase = slugFor(scene.title, `scene-${s + 1}`)
      let sceneSlug = sceneBase
      let m = 2
      while (usedSceneSlugs.has(sceneSlug)) sceneSlug = `${sceneBase}-${m++}`
      usedSceneSlugs.add(sceneSlug)

      const relative = path.posix.join('manuscript', chapterSlug, `${sceneSlug}.md`)
      const target = path.join(root, 'manuscript', chapterSlug, `${sceneSlug}.md`)
      await fsPromises.mkdir(path.dirname(target), { recursive: true })
      await writeFileDurable(target, `${scene.content}\n`)
      files.push(relative)
    }
  }

  // Build the binder from the freshly written files.
  const { structureService } = await import('./StructureService')
  const flavor: ProjectFlavor = 'chapters-scenes'
  const structure = await structureService.scan(root, flavor)
  await structureService.save(root, structure)

  return {
    chapters: split.chapters.length,
    scenes: split.chapters.reduce((sum, c) => sum + c.scenes.length, 0),
    files
  }
}
