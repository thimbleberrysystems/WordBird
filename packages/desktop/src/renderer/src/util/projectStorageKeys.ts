/**
 * Per-project localStorage keys for the renderer's Biscuit state.
 *
 * localStorage is scoped to the APP ORIGIN, not to the open project, so any
 * fixed key is shared by every project the app ever opens. That is how the
 * conversation list leaked (project A's chats appeared in project B) and how
 * the permission mode leaked after it. Anything describing one project's
 * agent session belongs behind these keys.
 *
 * Genuinely app-wide settings (panel widths, provider credentials) are NOT
 * keyed here — they are global on purpose.
 *
 * Pure and dependency-free so the keying contract can be unit-tested
 * without pulling in Vue/Pinia.
 */

const HISTORY_KEY_BASE = 'biscuit-conversations'
const CURRENT_KEY_BASE = 'biscuit-current-conversation'
const MODE_KEY_BASE = 'biscuit-mode'

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

/**
 * Key for the cached permission mode. Main owns the real value (in the
 * project's `.wordbird/agent-state/session.json`); this cache exists so the
 * auto-apply checks in editor.vue / agentReviewFallback.ts can read the mode
 * synchronously.
 *
 * Keying it per project is a SAFETY property, not tidiness: those checks
 * auto-apply edits when the mode reads `auto`, so a value left behind by a
 * different project could apply edits in a project the writer never put in
 * auto mode. A miss must therefore read as "unknown" — the callers fall back
 * to the safe `approvals` behavior — never as another project's answer.
 */
export const modeKey = (projectRoot: string | null | undefined): string => {
  const root = (projectRoot ?? '').trim()
  return root ? `${MODE_KEY_BASE}:${root}` : MODE_KEY_BASE
}
