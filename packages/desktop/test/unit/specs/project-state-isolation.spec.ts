/**
 * PROJECT STATE ISOLATION.
 *
 * Agent state — the conversation list, the durable thread, pending edits —
 * belongs to ONE project. Three separate leaks made it global (writer
 * report, 2026-07-20: "history is maintained across projects, and not even
 * cleared on a new conversation"):
 *
 *  1. the renderer's conversation list used FIXED localStorage keys, and
 *     localStorage is scoped to the app origin, not the open project;
 *  2. the main-side project resolver returned null whenever the focused
 *     window was not an editor (the detached Biscuit window, settings),
 *     dropping agent state onto the GLOBAL userData path mid-session;
 *  3. the checkpointer/threadId were bound once at connect() and never
 *     rebound, so a session begun in project A kept writing A's thread.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The resolver imports the Biscuit window module (Electron); stub it.
const biscuitRoot = { value: null as string | null }
vi.mock('../../../src/main/windows/biscuit', () => ({
  getBiscuitProjectRoot: () => biscuitRoot.value,
  isBiscuitWindowId: () => false
}))

import { conversationKeys } from '../../../src/renderer/src/util/conversationKeys'
import {
  getActiveAgentProjectRoot,
  setAgentToolAccessor,
  resetAgentProjectRootCache
} from '../../../src/main/services/ai/AgentProjectRootResolver'

describe('conversation list keys are per project', () => {
  it('two projects never share a storage key', () => {
    const a = conversationKeys('/home/w/novel-a')
    const b = conversationKeys('/home/w/novel-b')
    expect(a.history).not.toBe(b.history)
    expect(a.current).not.toBe(b.current)
    // The project is identifiable in the key (debuggability).
    expect(a.history).toContain('/home/w/novel-a')
  })

  it('the same project is stable across calls', () => {
    expect(conversationKeys('/home/w/novel-a')).toEqual(conversationKeys('/home/w/novel-a'))
    // Trailing whitespace must not fork a project's history.
    expect(conversationKeys('  /home/w/novel-a  ')).toEqual(conversationKeys('/home/w/novel-a'))
  })

  it('no project open falls back to the bare (scratch) keys', () => {
    const none = conversationKeys(null)
    expect(none.history).toBe('biscuit-conversations')
    expect(conversationKeys('')).toEqual(none)
    expect(conversationKeys(undefined)).toEqual(none)
    // …and that scratch list is NOT any project's list.
    expect(none.history).not.toBe(conversationKeys('/home/w/novel-a').history)
  })
})

describe('active project resolution survives focus moving off the editor', () => {
  const makeAccessor = (activeEditor: unknown): never =>
    ({ windowManager: { getActiveEditor: () => activeEditor } }) as never

  const editorWindow = (root: string): unknown => ({
    type: 'editor',
    openedRootDirectory: root
  })

  beforeEach(() => {
    resetAgentProjectRootCache()
    biscuitRoot.value = null
  })

  afterEach(() => {
    resetAgentProjectRootCache()
  })

  it('reads the root from the focused editor window', () => {
    setAgentToolAccessor(makeAccessor(editorWindow('/home/w/novel-a')))
    expect(getActiveAgentProjectRoot()).toBe('/home/w/novel-a')
  })

  it('keeps the last known root when focus lands on a non-editor window', () => {
    // Settings / a native dialog / anything not an EDITOR: the window
    // manager reports nothing. Returning null here is what silently moved
    // agent state to the global userData directory mid-session.
    setAgentToolAccessor(makeAccessor(editorWindow('/home/w/novel-a')))
    expect(getActiveAgentProjectRoot()).toBe('/home/w/novel-a')

    setAgentToolAccessor(makeAccessor(undefined))
    expect(getActiveAgentProjectRoot()).toBe('/home/w/novel-a')
  })

  it('falls back to the DETACHED BISCUIT window’s project', () => {
    // The Biscuit window is a raw BrowserWindow the window manager never
    // registers as an editor — but it knows the project it was opened for.
    setAgentToolAccessor(makeAccessor(undefined))
    biscuitRoot.value = '/home/w/novel-b'
    expect(getActiveAgentProjectRoot()).toBe('/home/w/novel-b')
  })

  it('a real editor still wins over both fallbacks', () => {
    biscuitRoot.value = '/home/w/novel-b'
    setAgentToolAccessor(makeAccessor(editorWindow('/home/w/novel-a')))
    expect(getActiveAgentProjectRoot()).toBe('/home/w/novel-a')
  })

  it('returns null only when nothing has ever resolved', () => {
    setAgentToolAccessor(makeAccessor(undefined))
    expect(getActiveAgentProjectRoot()).toBeNull()
  })

  it('switching editors switches the root (no stale pinning)', () => {
    setAgentToolAccessor(makeAccessor(editorWindow('/home/w/novel-a')))
    expect(getActiveAgentProjectRoot()).toBe('/home/w/novel-a')
    setAgentToolAccessor(makeAccessor(editorWindow('/home/w/novel-b')))
    expect(getActiveAgentProjectRoot()).toBe('/home/w/novel-b')
  })
})
