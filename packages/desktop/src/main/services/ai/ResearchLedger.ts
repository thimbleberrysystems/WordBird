/**
 * ResearchLedger — the turn-scoped shared research ledger.
 *
 * Root fix for parallel workers re-gathering the same sources: knowledge
 * gathered this turn flows FORWARD mechanically. Every successful
 * read-class tool result is recorded here (at the AgentToolService choke
 * point both providers share); repeats of web targets are served from the
 * ledger as digests instead of re-running the handler; and a live
 * GATHERED THIS TURN section rides every warm worker spawn and supervisor
 * iteration so new agents start from what the turn already knows.
 *
 * Two tiers:
 *  - SERVED (web_fetch / wiki_read / web_search / wiki_search): full
 *    state machine — reads 1-2 pass through, 3..MAX are digest-served
 *    (no handler, no network, no budget), past MAX repeatBlocked.
 *  - SECTION-ONLY (read_bible with a path / search_manuscript): recorded
 *    for the section but ALWAYS served full when actually called — canon
 *    verification (auditor, line-editor) must never get a digest instead
 *    of the real page, and SDK tool calls carry no agent identity so
 *    role-selective serving is impossible.
 *
 * Lifecycle: in-memory, grows during the writer turn (deliberately NOT
 * frozen like ContextBuilder's beginTurn sections — later waves must see
 * what earlier waves gathered), reset per writer turn by LangGraphManager
 * beside resetWebReadCounts(). Project-derived entries are invalidated
 * whenever a write tool succeeds (auto mode applies edits mid-turn).
 */

import { MAX_SAME_TARGET_READS, normalizeUrl, sanitizeWikiLang } from './WebToolHandlers'
import { neutralizeHarnessMarkers } from './coherencePass'

export const LEDGER_DIGEST_CHARS = 1200

/**
 * Read number at which a repeat stops running the handler and is served
 * from the ledger digest instead: reads 1–2 pass through, 3..MAX are
 * digest-served, past MAX the web layer withholds entirely.
 */
export const LEDGER_SERVE_FROM_READ = 3
export const LEDGER_SECTION_HEADER = 'GATHERED THIS TURN'
export const LEDGER_SECTION_MAX_ENTRIES = 25
export const LEDGER_SECTION_CHAR_CAP = 4000
/** Per-entry gist inside the rendered section (the full digest is what a
 * repeat read returns; the section is the catalog + gist). */
const SECTION_GIST_CHARS = 200

/** Web tools: recorded AND digest-served on repeat. */
const SERVED_TOOLS = new Set(['web_fetch', 'wiki_read', 'web_search', 'wiki_search'])
/** Project tools: recorded for the section, never digest-served. */
const SECTION_ONLY_TOOLS = new Set(['read_bible', 'search_manuscript'])

interface LedgerEntry {
  key: string
  tool: string
  target: string
  digest: string
  pointer: string
}

const str = (args: Record<string, unknown>, key: string): string | null => {
  const value = args[key]
  // Trimmed on the way OUT too: ledger keys are derived from this, so
  // ' page.md' and 'page.md' must not become two different entries.
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const normalizeQuery = (query: string): string => query.toLowerCase().replace(/\s+/g, ' ').trim()

const wikiLangOf = (args: Record<string, unknown>): string => {
  try {
    return sanitizeWikiLang(str(args, 'lang') ?? undefined)
  } catch {
    // The handler will reject the call anyway — key on the raw value so
    // the failed call never collides with a valid one.
    return String(args.lang).toLowerCase()
  }
}

export class ResearchLedger {
  private readonly _entries = new Map<string, LedgerEntry>()
  private readonly _readCounts = new Map<string, number>()
  private readonly _refreshPassed = new Set<string>()

  /** Normalized ledger key, or null when the call is not ledgered.
   * Key namespaces mirror the handler-level normalization exactly
   * (normalizeUrl / sanitizeWikiLang are the same functions) so the two
   * layers can never drift apart. */
  ledgerKeyFor(
    toolName: string,
    args: Record<string, unknown>
  ): { key: string; target: string } | null {
    switch (toolName) {
      case 'web_fetch': {
        const url = str(args, 'url')
        if (!url) return null
        return { key: `fetch:${normalizeUrl(url) ?? url}`, target: url }
      }
      case 'wiki_read': {
        const title = str(args, 'title')
        if (!title) return null
        return { key: `wiki:${wikiLangOf(args)}:${title.toLowerCase()}`, target: title }
      }
      case 'web_search': {
        const query = str(args, 'query')
        if (!query) return null
        return { key: `search:${normalizeQuery(query)}`, target: `search "${query}"` }
      }
      case 'wiki_search': {
        const query = str(args, 'query')
        if (!query) return null
        return {
          key: `wikisearch:${wikiLangOf(args)}:${normalizeQuery(query)}`,
          target: `wiki search "${query}"`
        }
      }
      case 'read_bible': {
        // Catalog listing (no path) stays live — only page reads ledger.
        const target = str(args, 'path')
        if (!target) return null
        return { key: `bible:${target}`, target }
      }
      case 'search_manuscript': {
        const term = str(args, 'entity') ?? str(args, 'query')
        if (!term) return null
        return { key: `msearch:${normalizeQuery(term)}`, target: `manuscript search "${term}"` }
      }
      default:
        return null
    }
  }

  /**
   * Called at the runForModel choke point BEFORE the handler. Returns a
   * complete served result (digest or block) when the call should not
   * reach the handler; null passes through. Section-only tools always
   * pass through. refresh:true escapes serving once per target per turn
   * (the handler's own once-per-turn refresh logic then governs); past
   * MAX even refresh is blocked — parity with the handler teeth.
   */
  checkRepeat(toolName: string, args: Record<string, unknown>): Record<string, unknown> | null {
    const keyed = this.ledgerKeyFor(toolName, args)
    if (!keyed) return null
    const count = (this._readCounts.get(keyed.key) ?? 0) + 1
    this._readCounts.set(keyed.key, count)

    if (!SERVED_TOOLS.has(toolName)) return null

    if (count > MAX_SAME_TARGET_READS) {
      return {
        repeatBlocked: true,
        target: keyed.target,
        reads: count,
        note:
          `"${keyed.target}" has been read ${count} times this turn (all agents share ` +
          'this counter) — its content has not changed and is withheld. Synthesize from ' +
          'earlier results and save_research your findings, or consult a DIFFERENT source.'
      }
    }
    if (count < LEDGER_SERVE_FROM_READ) return null

    if (args.refresh === true && !this._refreshPassed.has(keyed.key)) {
      this._refreshPassed.add(keyed.key)
      return null
    }
    const entry = this._entries.get(keyed.key)
    if (!entry) return null
    return {
      repeatRead: count,
      target: entry.target,
      digest: entry.digest,
      note:
        `"${entry.target}" was already gathered this turn (read ${count}× — all agents ` +
        `share this counter). Synthesize from this digest; ${entry.pointer}`
    }
  }

  /** Called after a successful handler run. Error-ish shapes are skipped
   * so a failed lookup never shadows a later successful one. */
  record(toolName: string, args: Record<string, unknown>, rawResult: unknown): void {
    if (!SERVED_TOOLS.has(toolName) && !SECTION_ONLY_TOOLS.has(toolName)) return
    const keyed = this.ledgerKeyFor(toolName, args)
    if (!keyed) return
    if (typeof rawResult !== 'object' || rawResult === null) return
    const result = rawResult as Record<string, unknown>
    if (result.repeatBlocked || result.budgetExhausted || result.found === false) return

    const built = this._buildDigest(toolName, keyed.target, result)
    if (!built) return
    this._entries.set(keyed.key, {
      key: keyed.key,
      tool: toolName,
      target: built.target,
      digest: built.digest,
      pointer: built.pointer
    })
  }

  /** Project-derived entries go stale the moment a write lands (auto
   * mode applies edits mid-turn); web entries survive — project writes
   * cannot change the internet. */
  invalidateProjectReads(): void {
    for (const key of [...this._entries.keys()]) {
      if (key.startsWith('bible:') || key.startsWith('msearch:')) {
        this._entries.delete(key)
        this._readCounts.delete(key)
      }
    }
  }

  /**
   * The GATHERED THIS TURN section — catalog + gist of everything read
   * so far, injected LIVE into warm worker spawns and supervisor
   * iterations. Context-capped (entries + chars); this is a context cap,
   * never a disk cap. Output is neutralized: digests derive from raw
   * handler results recorded before the choke point's defang step.
   */
  renderSection(): string {
    if (this._entries.size === 0) return ''
    const lines: string[] = [
      `${LEDGER_SECTION_HEADER} (shared across all agents this turn):`,
      'These sources were already read. Work from the gists below — re-reading a web ' +
      'source returns only a digest. Only re-read a project file if you need more than ' +
      'the gist shows.'
    ]
    const entries = [...this._entries.values()]
    let rendered = 0
    let chars = lines.join('\n').length
    for (const entry of entries) {
      if (rendered >= LEDGER_SECTION_MAX_ENTRIES) break
      const reads = this._readCounts.get(entry.key) ?? 1
      const gist = entry.digest.replace(/\s+/g, ' ').trim().slice(0, SECTION_GIST_CHARS)
      const line = `- [${entry.tool}] ${entry.target}${reads > 1 ? ` (read ${reads}×)` : ''}: ${gist}`
      if (chars + line.length + 1 > LEDGER_SECTION_CHAR_CAP) break
      lines.push(line)
      chars += line.length + 1
      rendered += 1
    }
    const omitted = entries.length - rendered
    if (omitted > 0) lines.push(`…and ${omitted} more sources already read this turn.`)
    return neutralizeHarnessMarkers(lines.join('\n'))
  }

  reset(): void {
    this._entries.clear()
    this._readCounts.clear()
    this._refreshPassed.clear()
  }

  private _buildDigest(
    toolName: string,
    target: string,
    result: Record<string, unknown>
  ): { target: string; digest: string; pointer: string } | null {
    if (toolName === 'web_fetch' || toolName === 'wiki_read') {
      const text = typeof result.text === 'string' ? result.text : null
      if (!text) return null
      const title = typeof result.title === 'string' && result.title ? result.title : target
      const url = typeof result.url === 'string' ? result.url : null
      return {
        target: url ? `${title} <${url}>` : title,
        digest: text.slice(0, LEDGER_DIGEST_CHARS),
        pointer:
          'the full text was already returned this turn — if you truly need it fresh, ' +
          'that requires the writer asking for a refresh'
      }
    }
    if (toolName === 'web_search' || toolName === 'wiki_search') {
      const results = Array.isArray(result.results) ? result.results : null
      if (!results || results.length === 0) return null
      const digest = results
        .slice(0, 5)
        .map((item) => {
          const row = item as Record<string, unknown>
          return `${String(row.title ?? '')} — ${String(row.url ?? '')}`.trim()
        })
        .filter((line) => line !== '—')
        .join('\n')
      if (!digest) return null
      return {
        target,
        digest: digest.slice(0, LEDGER_DIGEST_CHARS),
        pointer: 'these results do not change within a turn — pick a source and read it'
      }
    }
    if (toolName === 'read_bible') {
      const content = typeof result.content === 'string' ? result.content : null
      if (!content) return null
      return {
        target,
        digest: content.slice(0, LEDGER_DIGEST_CHARS),
        pointer: `full page: read_bible with path "${target}"`
      }
    }
    if (toolName === 'search_manuscript') {
      const matches = Array.isArray(result.matches) ? result.matches : null
      if (!matches || matches.length === 0) return null
      const digest = matches
        .slice(0, 12)
        .map((item) => {
          const row = item as Record<string, unknown>
          return `${String(row.file ?? '')}:${String(row.line ?? '')}: ${String(row.text ?? '').slice(0, 120)}`
        })
        .join('\n')
      return {
        target,
        digest: digest.slice(0, LEDGER_DIGEST_CHARS),
        pointer: 'narrow the query (or use entity=) for different results'
      }
    }
    // Every tool `record()` accepts (SERVED_TOOLS ∪ SECTION_ONLY_TOOLS) has a
    // branch above. An unrecognised shape is deliberately NOT digest-served:
    // returning null lets the real handler run instead of inventing a digest.
    return null
  }
}

/** Process-wide singleton — one writer turn, one ledger, all agents. */
export const researchLedger = new ResearchLedger()
