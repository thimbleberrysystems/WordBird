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

import { conversationKeys, modeKey } from '../../../src/renderer/src/util/projectStorageKeys'
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

describe('the cached permission mode is per project', () => {
  it('two projects never share a mode key', () => {
    expect(modeKey('/home/w/novel-a')).not.toBe(modeKey('/home/w/novel-b'))
    expect(modeKey('/home/w/novel-a')).toContain('/home/w/novel-a')
    expect(modeKey('  /home/w/novel-a  ')).toBe(modeKey('/home/w/novel-a'))
  })

  it('no project open falls back to the bare scratch key', () => {
    expect(modeKey(null)).toBe('biscuit-mode')
    expect(modeKey('')).toBe(modeKey(undefined))
    expect(modeKey(null)).not.toBe(modeKey('/home/w/novel-a'))
  })

  it('SAFETY: a project in auto cannot authorize auto-apply in another', () => {
    // The auto-apply checks in editor.vue and agentReviewFallback.ts read
    // this key synchronously and apply edits when it says `auto`. Under the
    // old shared key, opening a second project inherited the first one's
    // `auto` until main answered — applying edits in a project the writer
    // never put in auto mode. A miss must read as unknown, not as another
    // project's answer.
    const store = new Map<string, string>()
    store.set(modeKey('/home/w/novel-a'), 'auto')
    expect(store.get(modeKey('/home/w/novel-b'))).toBeUndefined()
    expect(store.get(modeKey('/home/w/novel-b')) === 'auto').toBe(false)
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

// ---- The tool server must prove itself at startup ---------------------------

describe('HTTP MCP server startup self-check', () => {
  it('starts, answers an MCP initialize, and reports its tools', async() => {
    // A dead tool server is invisible to the model except as "the wordbird
    // tools aren't connected" — which the writer cannot act on. The server
    // now proves it answers before the URL is handed to the runtime; this
    // pins that the real path (build → listen → initialize) works.
    const { AgentToolService, AgentToolPackLoader } = await import(
      '../../../src/main/services/ai/AgentToolService'
    )
    const { registerBuiltInAgentToolHandlers } = await import(
      '../../../src/main/services/ai/AgentToolHandlers'
    )
    const { buildWordbirdHttpMcpServer } = await import(
      '../../../src/main/services/ai/agentSdk/httpMcpServer'
    )
    const pathMod = await import('path')

    const service = new AgentToolService()
    registerBuiltInAgentToolHandlers(service)
    const loader = new AgentToolPackLoader(service.getKnownHandlerIds())
    service.loadToolPack(
      await loader.loadPack(pathMod.join(__dirname, '../../../static/agentTools.json'))
    )

    const handle = await buildWordbirdHttpMcpServer(service, () => undefined)
    try {
      expect(handle.config.type).toBe('http')
      expect(handle.config.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
      expect(handle.config.alwaysLoad).toBe(true)
      expect(handle.toolNames.length).toBeGreaterThan(0)

      // EVERY TURN OPENS A FRESH MCP CLIENT. A shared transport answers one
      // initialize and 400s the rest ("Server already initialized"), which
      // gave tools on turn 1 and none afterwards. This second initialize —
      // after the startup self-check already used one — is the regression
      // pin for that.
      const response = await fetch(handle.config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'spec', version: '1.0.0' }
          }
        })
      })
      expect(response.ok).toBe(true)
    } finally {
      await handle.close()
    }
  })

  it('close() releases the port (no leak across sessions)', async() => {
    const { AgentToolService } = await import('../../../src/main/services/ai/AgentToolService')
    const { buildWordbirdHttpMcpServer } = await import(
      '../../../src/main/services/ai/agentSdk/httpMcpServer'
    )
    const handle = await buildWordbirdHttpMcpServer(new AgentToolService(), () => undefined)
    const url = handle.config.url
    await handle.close()
    await expect(
      fetch(url, { method: 'POST', signal: AbortSignal.timeout(2000) })
    ).rejects.toThrow()
  })
})
