/**
 * BookExporter — whole-novel output beyond markdown.
 *
 * The compiled manuscript (assembleManuscript's markdown) converts to:
 *  - EPUB  via epub-gen-memory (pure JS, chapters from the heading lines)
 *  - DOCX  via html-to-docx    (pure JS)
 * with `marked` rendering the markdown to HTML in between. No pandoc, no
 * network — works out of the box on every install.
 */

import { marked } from 'marked'

export type BookFormat = 'md' | 'epub' | 'docx'

export interface BookMeta {
  title: string
  author?: string
}

interface ChapterSlice {
  title: string
  markdown: string
}

/**
 * Slice the compiled markdown into chapters on its top-level headings
 * (parts/chapters compile as # / ## lines). Prose before the first heading
 * becomes a front-matter section.
 */
export const splitChapters = (markdown: string): ChapterSlice[] => {
  const lines = markdown.split('\n')
  const slices: Array<{ title: string; lines: string[] }> = []
  let current: { title: string; lines: string[] } | null = null
  for (const line of lines) {
    const heading = /^#{1,2}\s+(.+?)\s*$/.exec(line)
    if (heading) {
      if (current) slices.push(current)
      current = { title: heading[1], lines: [line] }
    } else {
      if (!current) current = { title: '', lines: [] }
      current.lines.push(line)
    }
  }
  if (current) slices.push(current)
  return slices
    .map((slice) => ({ title: slice.title, markdown: slice.lines.join('\n').trim() }))
    .filter((slice) => slice.markdown.length > 0)
}

const toHtml = (markdown: string): string =>
  marked.parse(markdown, { async: false }) as string

export const exportEpub = async(markdown: string, meta: BookMeta): Promise<Buffer> => {
  const { default: epub } = await import('epub-gen-memory')
  const slices = splitChapters(markdown)
  const chapters =
    slices.length > 0
      ? slices.map((slice, index) => ({
        title: slice.title || `Chapter ${index + 1}`,
        content: toHtml(slice.markdown)
      }))
      : [{ title: meta.title, content: toHtml(markdown) }]
  const buffer = await epub(
    {
      title: meta.title,
      author: meta.author ?? '',
      // No network fetches — the book is self-contained.
      fetchTimeout: 1
    },
    chapters
  )
  return Buffer.from(buffer)
}

export const exportDocx = async(markdown: string, meta: BookMeta): Promise<Buffer> => {
  const { default: htmlToDocx } = await import('html-to-docx')
  const html = `<h1>${meta.title}</h1>\n${toHtml(markdown)}`
  const result = await htmlToDocx(html, undefined, {
    title: meta.title,
    creator: meta.author || 'WordBird'
  })
  return Buffer.isBuffer(result) ? result : Buffer.from(await (result as Blob).arrayBuffer())
}

/** Convert compiled markdown to the requested format ('md' passes through). */
export const renderBook = async(
  markdown: string,
  format: BookFormat,
  meta: BookMeta
): Promise<Buffer | string> => {
  if (format === 'epub') return exportEpub(markdown, meta)
  if (format === 'docx') return exportDocx(markdown, meta)
  return markdown
}
