/**
 * Web research tools for Biscuit: `web_search` (DuckDuckGo HTML, no API
 * key) and `web_fetch` (fetch a page and reduce it to readable text).
 *
 * Guardrails: http(s) only, no credentials in URLs, private/loopback
 * hosts rejected BOTH by name and by what DNS actually resolves them to
 * (anti-rebinding: the same lookup that validates is the one the socket
 * connects with), redirects followed manually with every hop re-guarded,
 * response size and time capped, HTML reduced to text before it reaches
 * the model.
 */

import axios from 'axios'
import type { AddressFamily, LookupAddress } from 'axios'
import crypto from 'crypto'
import dns from 'dns'
import fs from 'fs'
import net from 'net'
import path from 'path'
import type { AgentToolContext, AgentToolService } from './AgentToolService'

const MAX_RESPONSE_BYTES = 1_500_000
const FETCH_TIMEOUT_MS = 15000
const MAX_TEXT_CHARS = 20000
const USER_AGENT = 'WordBird-Biscuit/1.0 (novel research assistant)'

// ---- Web content cache ------------------------------------------------------
// Fetched pages/articles are cached per project so the SAME material is
// never re-downloaded turn after turn (research used to evaporate with the
// conversation). Lives under agent-state: git-ignored, snapshot-excluded,
// derived data — safe to delete any time. Deliberately UNBOUNDED in entry
// count (disk is not a constraint — writer decision); the only cleanup is
// dropping TTL-expired entries. Entries store the FULL extracted text; the
// context-window cap is applied at return time only.
export const WEB_CACHE_TTL_MS = 7 * 86_400_000

interface WebCacheEntry extends Record<string, unknown> {
  fetchedAt: number
}

const webCacheDir = (root: string): string =>
  path.join(root, '.wordbird', 'agent-state', 'web-cache')

const webCacheFile = (root: string, kind: string, id: string): string =>
  path.join(
    webCacheDir(root),
    `${crypto.createHash('sha1').update(`${kind}:${id}`).digest('hex')}.json`
  )

const readWebCache = (
  root: string | null | undefined,
  kind: string,
  id: string
): WebCacheEntry | null => {
  if (!root) return null
  try {
    const entry = JSON.parse(
      fs.readFileSync(webCacheFile(root, kind, id), 'utf8')
    ) as WebCacheEntry
    if (typeof entry.fetchedAt !== 'number') return null
    if (Date.now() - entry.fetchedAt > WEB_CACHE_TTL_MS) return null
    return entry
  } catch {
    return null
  }
}

const writeWebCache = (
  root: string | null | undefined,
  kind: string,
  id: string,
  payload: Record<string, unknown>
): void => {
  if (!root) return
  try {
    const dir = webCacheDir(root)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      webCacheFile(root, kind, id),
      JSON.stringify({ ...payload, fetchedAt: Date.now() })
    )
    // Housekeeping, not a cap: drop only entries past their TTL.
    const cutoff = Date.now() - WEB_CACHE_TTL_MS
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const stale =
          (JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as WebCacheEntry)
            .fetchedAt < cutoff
        if (stale) fs.rmSync(path.join(dir, name), { force: true })
      } catch {
        fs.rmSync(path.join(dir, name), { force: true })
      }
    }
  } catch {
    // The cache is an optimization — never fail the fetch over it.
  }
}

/** Cap cached full text down to the model-facing size at return time. */
const capCachedText = <T extends Record<string, unknown>>(entry: T): T => {
  if (typeof entry.text !== 'string' || entry.text.length <= MAX_TEXT_CHARS) return entry
  return { ...entry, text: entry.text.slice(0, MAX_TEXT_CHARS), truncated: true }
}

// ---- Same-page re-read thrash guard -----------------------------------------
// Weak models re-read the same page over and over inside one turn (the
// cache makes it cheap, but every read still burns worker steps and
// context). Repeat reads get an escalating nudge telling the model the
// content has not changed. Reset per writer turn by LangGraphManager.
const turnReadCounts = new Map<string, number>()

// Identical SEARCH queries repeat constantly inside one turn (weak models
// re-search instead of re-reading their own results). Search results are
// too volatile for the disk cache, but within a single writer turn the
// first answer is the answer — memoized here, cleared with the counters.
const turnSearchCache = new Map<string, Record<string, unknown>>()

// Hard per-turn budget on LIVE lookups (cache/memo hits are free): even a
// model that ignores every nudge cannot read the internet forever — past
// the budget, web tools stop fetching and demand synthesis + save.
export const WEB_TURN_LOOKUP_BUDGET = 40
let turnLiveLookups = 0

const consumeLookupBudget = (): Record<string, unknown> | null => {
  if (turnLiveLookups >= WEB_TURN_LOOKUP_BUDGET) {
    return {
      budgetExhausted: true,
      note:
        `This turn already made ${WEB_TURN_LOOKUP_BUDGET} live web lookups — no more ` +
        'fetching. Synthesize what you have and save_research it NOW.'
    }
  }
  turnLiveLookups += 1
  return null
}

export const resetWebReadCounts = (): void => {
  turnReadCounts.clear()
  turnSearchCache.clear()
  turnLiveLookups = 0
}

const withRepeatReadNote = <T extends Record<string, unknown>>(key: string, result: T): T => {
  const count = (turnReadCounts.get(key) ?? 0) + 1
  turnReadCounts.set(key, count)
  if (count <= 1) return result
  return {
    ...result,
    repeatRead: count,
    note:
      `You have read this exact page ${count} times this turn — its content does not ` +
      'change. Synthesize from what you already have (and save_research your findings) ' +
      'instead of re-reading.'
  }
}

// ---- In-flight coalescing ---------------------------------------------------
// Parallel workers routinely research the same ground (two researchers,
// one wiki page). Identical concurrent requests share ONE network call:
// the second caller awaits the first's promise instead of re-fetching.
const inFlight = new Map<string, Promise<unknown>>()

const coalesce = async(key: string, work: () => Promise<unknown>): Promise<unknown> => {
  const pending = inFlight.get(key)
  if (pending) return pending
  const promise = work().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

// ---- Rate-limit tolerance ---------------------------------------------------
// Free/keyless endpoints (DuckDuckGo, Wikipedia, dictionaryapi) throttle.
// Retries happen HERE, mechanically, so a 429 never needs the writer (or
// the model) to intervene. Delays are exported and mutable for tests.
export const WEB_RETRY_DELAYS_MS = [1500, 4000, 10000]
const RETRYABLE_STATUS = new Set([429, 502, 503])
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'])

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const retryAfterMs = (headers: Record<string, unknown> | undefined): number | null => {
  const raw = headers?.['retry-after']
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000)
  return null
}

/**
 * axios.get with graceful retry on rate limits and transient network
 * failures. Honors Retry-After (capped 30s). Non-retryable failures and
 * exhausted retries propagate exactly like a plain axios.get.
 */
const getWithRetry = async(
  url: string,
  config: Record<string, unknown>
): Promise<{ status: number; data: unknown; headers: Record<string, unknown> }> => {
  let lastError: unknown
  for (let attempt = 0; attempt <= WEB_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await axios.get(url, config as never)
      const status = Number(response.status)
      if (RETRYABLE_STATUS.has(status) && attempt < WEB_RETRY_DELAYS_MS.length) {
        await sleep(
          retryAfterMs(response.headers as Record<string, unknown>) ??
            WEB_RETRY_DELAYS_MS[attempt]
        )
        continue
      }
      return response as never
    } catch (error) {
      lastError = error
      const err = error as { code?: string; response?: { status?: number } }
      const retryable =
        (err.code && RETRYABLE_CODES.has(err.code)) ||
        (err.response?.status !== undefined && RETRYABLE_STATUS.has(err.response.status))
      if (!retryable || attempt >= WEB_RETRY_DELAYS_MS.length) throw error
      await sleep(WEB_RETRY_DELAYS_MS[attempt])
    }
  }
  throw lastError
}

const str = (args: Record<string, unknown>, key: string): string => {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Agent tool argument '${key}' must be a non-empty string.`)
  }
  return value.trim()
}

const optInt = (args: Record<string, unknown>, key: string): number | undefined => {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Agent tool argument '${key}' must be a positive integer when provided.`)
  }
  return value
}

const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|::1)$/i

/**
 * Is this IP address (v4 or v6) something an SSRF must never reach?
 * Loopback, RFC1918, link-local/cloud-metadata, unspecified, v6
 * unique-local + link-local, and v4-mapped v6 forms of all of the above.
 */
export const isPrivateAddress = (ip: string): boolean => {
  let candidate = ip.trim().toLowerCase()
  // ::ffff:127.0.0.1 — unwrap v4-mapped v6 and judge the v4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(candidate)
  if (mapped) candidate = mapped[1]

  if (net.isIPv4(candidate)) {
    const octets = candidate.split('.').map(Number)
    const [a, b] = octets
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
    return false
  }
  if (net.isIPv6(candidate)) {
    if (candidate === '::1' || candidate === '::') return true
    if (candidate.startsWith('fc') || candidate.startsWith('fd')) return true // ULA fc00::/7
    if (/^fe[89ab]/.test(candidate)) return true // link-local fe80::/10
    return false
  }
  // Not parseable as an IP — callers treat that as unsafe by default.
  return true
}

export const assertSafeUrl = (raw: string): URL => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Invalid URL: ${raw}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http(s) URLs are allowed.')
  }
  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not allowed.')
  }
  if (PRIVATE_HOST_RE.test(url.hostname)) {
    throw new Error('Local and private-network hosts are not allowed.')
  }
  // Literal-IP hosts are judged as addresses, not just against the name
  // regex (catches e.g. http://[fd00::1]/ or unusual private v4 ranges).
  const bareHost = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(bareHost) && isPrivateAddress(bareHost)) {
    throw new Error('Local and private-network hosts are not allowed.')
  }
  return url
}

type RawLookup = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void
) => void

/**
 * DNS-pinned SSRF guard: the lookup that VALIDATES the resolution is the
 * lookup the socket CONNECTS with, so a hostname cannot pass a check and
 * then re-resolve to 127.0.0.1 (DNS rebinding). If any resolved address
 * is private, the connection is refused outright.
 */
export const makeSafeLookup = (rawLookup: RawLookup = dns.lookup as unknown as RawLookup) => {
  // Signature mirrors axios's lookup contract exactly (its LookupAddress,
  // its 4|6 AddressFamily) so the config site needs no casts.
  return (
    hostname: string,
    options: object,
    callback: (
      err: Error | null,
      address: LookupAddress | LookupAddress[],
      family?: AddressFamily
    ) => void
  ): void => {
    const all = Boolean((options as dns.LookupOptions).all)
    rawLookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
      if (err) return callback(err, [])
      const list = Array.isArray(addresses) ? addresses : []
      if (list.length === 0) {
        return callback(new Error(`DNS returned no addresses for ${hostname}`), [])
      }
      const bad = list.find((a) => isPrivateAddress(a.address))
      if (bad) {
        return callback(
          new Error(
            `Refusing to connect: ${hostname} resolves to the private address ${bad.address}.`
          ),
          []
        )
      }
      const toEntry = (a: dns.LookupAddress): { address: string; family?: AddressFamily } => ({
        address: a.address,
        family: a.family === 6 ? 6 : 4
      })
      if (all) return callback(null, list.map(toEntry))
      const first = toEntry(list[0])
      callback(null, first, first.family)
    })
  }
}

const safeLookup = makeSafeLookup()

// ---- URL provenance (Anthropic web_fetch pattern) --------------------------
// web_fetch may only hit URLs the writer supplied or a search returned this
// session — a constructed URL is both a hallucinated-source risk and a data
// exfiltration channel (an injected page saying "fetch evil.com/?d=<canon>").
// Enforced HERE, mechanically, because prompts can be talked out of.

export const MAX_KNOWN_URLS = 5000
const knownUrls = new Set<string>()

/** Comparison form: case-normalized origin, no hash, query kept. */
const normalizeUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw)
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

const rememberUrl = (raw: string): void => {
  const normalized = normalizeUrl(raw)
  if (!normalized) return
  if (knownUrls.has(normalized)) return
  if (knownUrls.size >= MAX_KNOWN_URLS) {
    // FIFO trim: Sets iterate in insertion order.
    const oldest = knownUrls.values().next().value
    if (oldest) knownUrls.delete(oldest)
  }
  knownUrls.add(normalized)
}

/**
 * Register every http(s) URL found in free text (writer messages) as
 * fetchable. Called by LangGraphManager on each outgoing writer message.
 */
export const registerUrlProvenance = (text: string): void => {
  if (!text) return
  const urlRe = /https?:\/\/[^\s<>"'()[\]{}]+/gi
  for (const match of text.matchAll(urlRe)) {
    // Trailing sentence punctuation is prose, not URL.
    rememberUrl(match[0].replace(/[.,;:!?]+$/, ''))
  }
}

/** Conversation switch — a new thread starts with a clean slate. */
export const clearUrlProvenance = (): void => {
  knownUrls.clear()
}

const isKnownUrl = (raw: string): boolean => {
  const normalized = normalizeUrl(raw)
  return normalized !== null && knownUrls.has(normalized)
}

const decodeEntities = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x?\d+;/g, ' ')
    .replace(/&nbsp;/g, ' ')

/** Reduce an HTML document to readable text (rough but dependency-free). */
export const htmlToText = (html: string): string => {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
  const text = withBreaks.replace(/<[^>]+>/g, ' ')
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

const extractTitle = (html: string): string => {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim().slice(0, 300) : ''
}

const MAX_REDIRECT_HOPS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const webFetch = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const rawUrl = str(args, 'url')

  // DELIBERATE ordering: a fresh cache hit returns BEFORE the provenance
  // gate — no network happens, so the SSRF/exfiltration surface that
  // provenance guards is unreachable, and the content was obtained under
  // provenance when first fetched. Cache MISSES take the full pipeline.
  const cacheId = normalizeUrl(rawUrl)
  if (args.refresh !== true && cacheId) {
    const cached = readWebCache(context.projectRoot, 'fetch', cacheId)
    if (cached) {
      return withRepeatReadNote(`fetch:${cacheId}`, { ...capCachedText(cached), cached: true })
    }
  }

  // Two parallel workers fetching the same page share one network call.
  const result = await coalesce(`fetch:${cacheId ?? rawUrl}`, () =>
    webFetchLive(rawUrl, cacheId, context)
  )
  return withRepeatReadNote(`fetch:${cacheId ?? rawUrl}`, result as Record<string, unknown>)
}

const webFetchLive = async(
  rawUrl: string,
  cacheId: string | null,
  context: AgentToolContext
): Promise<unknown> => {
  const exhausted = consumeLookupBudget()
  if (exhausted) return { url: rawUrl, ...exhausted }
  let url = assertSafeUrl(rawUrl)

  // Provenance gate: only URLs the writer supplied or a search returned.
  if (!isKnownUrl(url.toString())) {
    throw new Error(
      'This URL did not come from the writer or from a search result this session. ' +
      'Use web_search or wiki_search first and fetch a URL it returned. ' +
      '(Guessed URLs are how hallucinated sources — and data exfiltration — happen.)'
    )
  }

  // Redirects are followed MANUALLY so every hop goes back through the
  // guard — axios's own maxRedirects would happily follow a public page's
  // 302 into 169.254.169.254. Each connection also uses the DNS-pinned
  // lookup, so validation and connection can never disagree. Redirect
  // targets are server-chosen, so they are exempt from provenance but
  // still pass assertSafeUrl.
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const response = await getWithRetry(url.toString(), {
      timeout: FETCH_TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxRedirects: 0,
      lookup: safeLookup,
      responseType: 'text',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain,*/*;q=0.8' },
      // Treat every status (incl. 3xx) as resolved so we can handle it.
      validateStatus: () => true
    })

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = String(response.headers.location ?? '')
      if (!location) {
        return { url: url.toString(), status: response.status, error: 'Redirect without Location' }
      }
      // Relative Locations resolve against the current URL; the result is
      // re-guarded exactly like a writer-supplied URL.
      url = assertSafeUrl(new URL(location, url).toString())
      rememberUrl(url.toString())
      continue
    }

    if (response.status >= 400) {
      return { url: url.toString(), status: response.status, error: `HTTP ${response.status}` }
    }

    const body = String(response.data ?? '')
    const contentType = String(response.headers['content-type'] ?? '')
    const isHtml = contentType.includes('html') || /^\s*</.test(body)
    const text = isHtml ? htmlToText(body) : body

    // The cache keeps the FULL extracted text (disk is not a constraint);
    // only the model-facing return is capped. Keyed by the REQUESTED url —
    // that is what gets asked for again.
    const fullResult = {
      url: url.toString(),
      status: response.status,
      title: isHtml ? extractTitle(body) : '',
      text,
      truncated: false
    }
    if (cacheId) writeWebCache(context.projectRoot, 'fetch', cacheId, fullResult)
    return capCachedText(fullResult)
  }

  return {
    url: url.toString(),
    error: `Gave up after ${MAX_REDIRECT_HOPS} redirects.`
  }
}

/** Parse DuckDuckGo's HTML results page into {title, url, snippet} rows. */
export const parseDuckDuckGoHtml = (
  html: string
): Array<{ title: string; url: string; snippet: string }> => {
  const results: Array<{ title: string; url: string; snippet: string }> = []
  const anchorRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g
  let match: RegExpExecArray | null
  while ((match = anchorRe.exec(html)) !== null && results.length < 10) {
    let href = decodeEntities(match[1])
    // DDG wraps result URLs: //duckduckgo.com/l/?uddg=<encoded>&rut=…
    const uddg = /[?&]uddg=([^&]+)/.exec(href)
    if (uddg) {
      try {
        href = decodeURIComponent(uddg[1])
      } catch {
        // keep the wrapped URL
      }
    }
    const title = htmlToText(match[2]).replace(/\n/g, ' ').trim()
    const snippet = match[3] ? htmlToText(match[3]).replace(/\n/g, ' ').trim() : ''
    if (title && href.startsWith('http')) {
      results.push({ title, url: href, snippet: snippet.slice(0, 300) })
    }
  }
  return results
}

const webSearch = async(
  args: Record<string, unknown>,
  _context: AgentToolContext
): Promise<unknown> => {
  const query = str(args, 'query')
  const maxResults = Math.min(optInt(args, 'maxResults') ?? 5, 10)

  const memoKey = `search:${query.toLowerCase().replace(/\s+/g, ' ').trim()}`
  const memoized = turnSearchCache.get(memoKey)
  if (memoized) {
    const memoResults = ((memoized.results as Array<{ url: string }> | undefined) ?? []).slice(
      0,
      maxResults
    )
    for (const result of memoResults) rememberUrl(result.url)
    return withRepeatReadNote(memoKey, { ...memoized, results: memoResults, cached: true })
  }

  const exhausted = consumeLookupBudget()
  if (exhausted) return { query, results: [], ...exhausted }

  const response = await getWithRetry('https://html.duckduckgo.com/html/', {
    params: { q: query },
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    responseType: 'text',
    headers: { 'User-Agent': USER_AGENT }
  })

  const results = parseDuckDuckGoHtml(String(response.data ?? '')).slice(0, maxResults)
  for (const result of results) rememberUrl(result.url)
  const payload = {
    query,
    results,
    note:
      results.length === 0
        ? 'No results parsed. Try a simpler query, or use web_fetch on a known URL.'
        : undefined
  }
  turnSearchCache.set(memoKey, payload)
  return withRepeatReadNote(memoKey, payload)
}

// ---- Wikipedia (structured research, keyless REST API) ----

/** Wikipedia language codes are short and alphanumeric — anything else is rejected. */
export const sanitizeWikiLang = (lang: string | undefined): string => {
  if (!lang) return 'en'
  const cleaned = lang.trim().toLowerCase()
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(cleaned)) {
    throw new Error(`Invalid Wikipedia language code: ${lang}`)
  }
  return cleaned
}

const wikiSearch = async(
  args: Record<string, unknown>,
  _context: AgentToolContext
): Promise<unknown> => {
  const query = str(args, 'query')
  const lang = sanitizeWikiLang(optStrLocal(args, 'lang'))
  const limit = Math.min(optInt(args, 'maxResults') ?? 5, 10)

  const memoKey = `wikisearch:${lang}:${query.toLowerCase().replace(/\s+/g, ' ').trim()}`
  const memoized = turnSearchCache.get(memoKey)
  if (memoized) {
    for (const result of (memoized.results as Array<{ url: string }> | undefined) ?? []) {
      rememberUrl(result.url)
    }
    return withRepeatReadNote(memoKey, { ...memoized, cached: true })
  }

  const exhausted = consumeLookupBudget()
  if (exhausted) return { query, lang, results: [], ...exhausted }

  const response = await getWithRetry(
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/page`,
    {
      params: { q: query, limit },
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT }
    }
  )

  const searchData = response.data as { pages?: Array<Record<string, unknown>> } | undefined
  const pages = Array.isArray(searchData?.pages) ? searchData.pages : []
  const results = pages.map((p) => ({
    title: String(p.title ?? ''),
    description: String(p.description ?? ''),
    excerpt: htmlToText(String(p.excerpt ?? '')).slice(0, 300),
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.key ?? p.title ?? ''))}`
  }))
  for (const result of results) rememberUrl(result.url)
  const payload = { query, lang, results }
  turnSearchCache.set(memoKey, payload)
  return withRepeatReadNote(memoKey, payload)
}

const wikiRead = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const title = str(args, 'title')
  const lang = sanitizeWikiLang(optStrLocal(args, 'lang'))

  const cacheId = `wiki:${lang}:${title.toLowerCase()}`
  if (args.refresh !== true) {
    const cached = readWebCache(context.projectRoot, 'wiki', cacheId)
    if (cached) {
      if (typeof cached.url === 'string') rememberUrl(cached.url)
      return withRepeatReadNote(cacheId, { ...capCachedText(cached), cached: true })
    }
  }

  const result = await coalesce(`wiki:${cacheId}`, () =>
    wikiReadLive(title, lang, cacheId, context)
  )
  return withRepeatReadNote(cacheId, result as Record<string, unknown>)
}

const wikiReadLive = async(
  title: string,
  lang: string,
  cacheId: string,
  context: AgentToolContext
): Promise<unknown> => {
  const exhausted = consumeLookupBudget()
  if (exhausted) return { title, lang, found: false, ...exhausted }
  // Plain-text extract of the full article via the MediaWiki API.
  const response = await getWithRetry(`https://${lang}.wikipedia.org/w/api.php`, {
    params: {
      action: 'query',
      prop: 'extracts',
      explaintext: 1,
      redirects: 1,
      format: 'json',
      titles: title
    },
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    headers: { 'User-Agent': USER_AGENT }
  })

  const wikiData = response.data as
    | { query?: { pages?: Record<string, unknown> } }
    | undefined
  const pages = wikiData?.query?.pages ?? {}
  const first = Object.values(pages)[0] as
    | { title?: string; extract?: string; missing?: string }
    | undefined
  if (!first || first.missing !== undefined || !first.extract) {
    return {
      title,
      lang,
      found: false,
      note: 'No article with that exact title. Use wiki_search to find the right one.'
    }
  }
  const text = first.extract
  const articleUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(first.title ?? title)}`
  rememberUrl(articleUrl)
  // Full extract on disk; model-facing cap applied at return time.
  const fullResult = {
    title: first.title ?? title,
    lang,
    found: true,
    url: articleUrl,
    text,
    truncated: false
  }
  writeWebCache(context.projectRoot, 'wiki', cacheId, fullResult)
  return capCachedText(fullResult)
}

// ---- Dictionary / thesaurus (keyless, dictionaryapi.dev) ----

const dictionaryLookup = async(
  args: Record<string, unknown>,
  _context: AgentToolContext
): Promise<unknown> => {
  const word = str(args, 'word')
  if (!/^[\p{L}\p{M}'’-]{1,60}$/u.test(word)) {
    throw new Error('Provide a single word (letters, apostrophes, hyphens only).')
  }

  const response = await getWithRetry(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
    {
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: () => true
    }
  )

  if (response.status === 404) {
    return { word, found: false, note: 'Not in the dictionary — check the spelling.' }
  }
  if (response.status >= 400 || !Array.isArray(response.data)) {
    return { word, found: false, note: `Dictionary service error (HTTP ${response.status}).` }
  }

  const entries = response.data.slice(0, 2) as Array<Record<string, unknown>>
  const meanings: Array<{
    partOfSpeech: string
    definitions: string[]
    synonyms: string[]
    antonyms: string[]
  }> = []
  for (const entry of entries) {
    for (const meaning of (entry.meanings as Array<Record<string, unknown>>) ?? []) {
      const defs = ((meaning.definitions as Array<Record<string, unknown>>) ?? [])
        .slice(0, 4)
        .map((d) => String(d.definition ?? ''))
      meanings.push({
        partOfSpeech: String(meaning.partOfSpeech ?? ''),
        definitions: defs,
        synonyms: ((meaning.synonyms as string[]) ?? []).slice(0, 12),
        antonyms: ((meaning.antonyms as string[]) ?? []).slice(0, 8)
      })
    }
  }
  return { word, found: true, meanings: meanings.slice(0, 6) }
}

// Local optional-string helper (str/optInt defined above).
const optStrLocal = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Agent tool argument '${key}' must be a string when provided.`)
  }
  return value
}

export const registerWebAgentToolHandlers = (service: AgentToolService): void => {
  service.registerHandler('web_search', webSearch)
  service.registerHandler('web_fetch', webFetch)
  service.registerHandler('wiki_search', wikiSearch)
  service.registerHandler('wiki_read', wikiRead)
  service.registerHandler('dictionary_lookup', dictionaryLookup)
}
