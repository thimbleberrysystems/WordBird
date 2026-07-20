/**
 * localStorage keys for the Biscuit conversation list.
 *
 * These were once FIXED strings, which made the list global: localStorage
 * is scoped to the app origin, not to the open project, so every project
 * read and wrote one shared list and project A's chats appeared in project
 * B. Transcripts were already per-project (`.wordbird/transcripts/`) —
 * only this list leaked.
 *
 * Pure and dependency-free so the keying contract can be unit-tested
 * without pulling in Vue/Pinia.
 */

const HISTORY_KEY_BASE = 'biscuit-conversations'
const CURRENT_KEY_BASE = 'biscuit-current-conversation'

export interface ConversationStorageKeys {
  history: string
  current: string
}

/**
 * Keys for a project. `null`/'' (no project open) keeps the bare legacy
 * keys, so the no-project scratch chat behaves exactly as before.
 *
 * The root is used verbatim: it is already unique and stable, and keeping
 * it readable makes the stored data debuggable.
 */
export const conversationKeys = (
  projectRoot: string | null | undefined
): ConversationStorageKeys => {
  const root = (projectRoot ?? '').trim()
  if (!root) return { history: HISTORY_KEY_BASE, current: CURRENT_KEY_BASE }
  return { history: `${HISTORY_KEY_BASE}:${root}`, current: `${CURRENT_KEY_BASE}:${root}` }
}
