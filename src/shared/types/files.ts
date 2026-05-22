// Core file/tab/document shapes shared between main and renderer.
//
// Concrete fields are populated as call-sites convert to TS in subsequent
// commits. Until then, these are intentionally open structures — better an
// imperfect surface than a placeholder that's wrong.

export type LineEnding = 'lf' | 'crlf'

export interface SerializedStat {
  size: number
  mtimeMs: number
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink?: boolean
}

export interface MarkdownDocument {
  markdown: string
  filename: string
  pathname: string | null
  encoding?: string
  lineEnding?: LineEnding
  adjustLineEndingOnSave?: boolean
  trimTrailingNewline?: number
  isMixedLineEndings?: boolean
}

export interface FileHistory {
  stack: unknown[]
  index: number
}

/**
 * Per-tab editor state. Refined as Commit 7 rewrites the editor store and
 * Commit 8 converts component consumers. The {} sentinel used by the
 * pre-migration code (for "no tab selected") is replaced by `null` in the
 * Setup-Store rewrite — see plan section D.3.
 */
export interface IFileState {
  id: string
  filename: string
  pathname: string | null
  markdown: string
  history?: FileHistory
  cursor?: unknown
  wordCount?: { word: number; character: number; paragraph: number; all: number }
  encoding?: string
  lineEnding?: LineEnding
  adjustLineEndingOnSave?: boolean
  trimTrailingNewline?: number
  isSaved?: boolean
  isMixedLineEndings?: boolean
  notifications?: unknown[]
  [key: string]: unknown
}

export type ITab = IFileState

export interface FileChangeDetail {
  pathname: string
  type?: string
  [key: string]: unknown
}

export interface TabOptions {
  selected?: boolean
  [key: string]: unknown
}

export interface SaveOptions {
  encoding?: string
  lineEnding?: LineEnding
  adjustLineEndingOnSave?: boolean
  trimTrailingNewline?: number
}

export interface BootstrapEditorConfig {
  isNewWindow: boolean
  markdownList: MarkdownDocument[]
  lineEnding: LineEnding
  sideBarVisibility: boolean
  tabBarVisibility: boolean
  sourceCodeModeEnabled: boolean
  preferences: unknown
  userKeybindings: unknown
  recentlyUsedFiles: string[]
  windowId: number
  [key: string]: unknown
}

export interface PageOptions {
  pageSize?: string
  pageSizeWidth?: number
  pageSizeHeight?: number
  isLandscape?: boolean
  printBackground?: boolean
  [key: string]: unknown
}

export type ExportType = 'pdf' | 'html' | 'styledHtml' | 'png' | 'jpeg'
