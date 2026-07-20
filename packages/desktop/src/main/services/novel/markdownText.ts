/**
 * Small text helpers shared by the novel services.
 *
 * These existed as near-identical private copies in EntityIndex,
 * ProjectHealth, ProseLint, LoreInjection, VoicePriming and Skills. One
 * source means one place to fix a bug (the front-matter regex in
 * particular is easy to get subtly wrong around \r\n).
 */

/** Escape a string for safe interpolation into a RegExp. */
export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Leading YAML front matter (`---` … `---`). Group 1 is the inner block.
 * Callers that only want the body should use `stripFrontMatter`.
 */
export const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** The document with any leading front-matter block removed. */
export const stripFrontMatter = (content: string): string =>
  content.replace(FRONT_MATTER_RE, '').trim()

/** The raw inner front-matter block, or '' when the file has none. */
export const frontMatterOf = (content: string): string => {
  const match = FRONT_MATTER_RE.exec(content)
  return match ? match[1] : ''
}

/**
 * Word-boundary, case-insensitive match for `term` inside `text`. Unicode
 * aware, so "Finn" does not match "Finnegan" and accented names still work.
 */
export const mentionsTerm = (text: string, term: string): boolean => {
  const escaped = escapeRegExp(term.trim())
  if (!escaped) return false
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(text)
}
