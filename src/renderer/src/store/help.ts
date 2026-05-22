import { getUniqueId, deepClone } from '../util'

// Helper module (NOT a Pinia store): defaults and factories for the editor
// document state objects.

export interface DocumentEncoding {
  encoding: string
  isBom: boolean
}

export interface DocumentSearchMatches {
  index: number
  matches: unknown[]
  value: string
}

export interface DocumentHistory {
  stack: unknown[]
  index: number
}

export interface DocumentWordCount {
  paragraph: number
  word: number
  character: number
  all: number
}

export interface IDocumentState {
  id?: string
  isSaved: boolean
  pathname: string
  filename: string
  markdown: string
  encoding: DocumentEncoding
  lineEnding: 'lf' | 'crlf' | string
  trimTrailingNewline: number
  adjustLineEndingOnSave: boolean
  history: DocumentHistory
  cursor: unknown
  wordCount: DocumentWordCount
  searchMatches: DocumentSearchMatches
  scrollTop: number
  muyaIndexCursor: unknown
  notifications: unknown[]
  lastSavedHistoryId?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

/**
 * Default internal markdown document with editor options.
 */
export const defaultFileState: IDocumentState = {
  isSaved: true,
  pathname: '',
  filename: 'Untitled-1',
  markdown: '',
  encoding: {
    encoding: 'utf8',
    isBom: false
  },
  lineEnding: 'lf',
  trimTrailingNewline: 3,
  adjustLineEndingOnSave: false,
  history: {
    stack: [],
    index: -1
  },
  cursor: null,
  wordCount: {
    paragraph: 0,
    word: 0,
    character: 0,
    all: 0
  },
  searchMatches: {
    index: -1,
    matches: [],
    value: ''
  },
  scrollTop: 0,
  muyaIndexCursor: null,
  notifications: []
}

export const getOptionsFromState = (file: IDocumentState) => {
  const { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline } = file
  return { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline }
}

const documentStateKeys: ReadonlyArray<keyof IDocumentState> = [
  'isSaved',
  'pathname',
  'filename',
  'markdown',
  'encoding',
  'lineEnding',
  'trimTrailingNewline',
  'adjustLineEndingOnSave',
  'history',
  'cursor',
  'wordCount',
  'searchMatches',
  'scrollTop',
  'muyaIndexCursor',
  'notifications'
]

export const getBlankFileState = (
  tabs: Array<{ pathname: string; filename: string }>,
  defaultEncoding: string = defaultFileState.encoding.encoding,
  lineEnding: string = defaultFileState.lineEnding,
  markdown: string | null = defaultFileState.markdown
): IDocumentState => {
  const fileState = deepClone(defaultFileState) as IDocumentState
  const defaultFilenamePrefix = defaultFileState.filename.split('-')[0]
  let untitleId = Math.max(
    ...tabs.map((f) => {
      if (f.pathname === '') {
        return +f.filename.split('-')[1]
      } else {
        return 0
      }
    }),
    0
  )

  const id = getUniqueId()

  // We may pass markdown=null as a parameter.
  if (markdown == null) {
    markdown = defaultFileState.markdown
  }

  fileState.encoding.encoding = defaultEncoding
  return Object.assign(fileState, {
    lineEnding,
    adjustLineEndingOnSave: lineEnding.toLowerCase() === 'crlf',
    id,
    filename: `${defaultFilenamePrefix}-${++untitleId}`,
    markdown,
    lastSavedHistoryId: -1
  })
}

/**
 * Creates an internal document from the given document.
 */
export const createDocumentState = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markdownDocument: any = {},
  id: string = getUniqueId()
): IDocumentState => {
  markdownDocument = markdownDocument || {}
  const docState = deepClone(defaultFileState) as IDocumentState

  for (const key of documentStateKeys) {
    if (markdownDocument[key] !== undefined) {
      docState[key] = markdownDocument[key]
    }
  }

  return Object.assign(docState, {
    id,
    lastSavedHistoryId: -1
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getFileStateFromData = (data: any): IDocumentState => createDocumentState(data)
