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

/**
 * Book typography for the EPUB (Atticus-style defaults): classic serif
 * body, indented paragraphs with no gap (except after breaks), styled
 * chapter openings, and centered scene-break marks. E-readers may override
 * fonts, but structure and spacing survive.
 */
const BOOK_CSS = `
  body { font-family: "Georgia", "Times New Roman", serif; line-height: 1.6; }
  h1, h2 {
    text-align: center;
    font-weight: normal;
    letter-spacing: 0.06em;
    margin: 2.5em 0 1.8em;
    page-break-before: always;
  }
  h1 { font-size: 1.5em; }
  h2 { font-size: 1.25em; }
  p { margin: 0; text-indent: 1.4em; text-align: justify; }
  h1 + p, h2 + p, hr + p { text-indent: 0; }
  h1 + p::first-letter, h2 + p::first-letter {
    font-size: 2.6em;
    line-height: 1;
    float: left;
    padding-right: 0.06em;
  }
  hr {
    border: none;
    text-align: center;
    margin: 1.4em 0;
  }
  hr::after { content: "* * *"; letter-spacing: 0.4em; }
  blockquote { font-style: italic; margin: 1em 2em; }
`

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
      css: BOOK_CSS,
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
