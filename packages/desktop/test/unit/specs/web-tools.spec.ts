/**
 * Web research tools, handler-level: every tool (web_search, web_fetch,
 * wiki_search, wiki_read, dictionary_lookup) exercised over a mocked
 * axios — no network — plus the SSRF hardening this suite exists to
 * lock down: private-address detection, DNS-pinned lookups (rebinding),
 * and manual redirect following with every hop re-guarded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  assertSafeUrl,
  clearUrlProvenance,
  isPrivateAddress,
  makeSafeLookup,
  registerUrlProvenance,
  registerWebAgentToolHandlers,
  resetWebReadCounts,
  MAX_KNOWN_URLS,
  WEB_CACHE_TTL_MS,
  WEB_RETRY_DELAYS_MS,
  WEB_TURN_LOOKUP_BUDGET
} from '../../../src/main/services/ai/WebToolHandlers'
import { buildSupervisorPrompt } from '../../../src/main/services/ai/orchestrator/Orchestrator'
import { AGENT_ROLES } from '../../../src/main/services/ai/orchestrator/roles'
import { AgentToolService } from '../../../src/main/services/ai/AgentToolService'

vi.mock('axios', () => ({
  default: { get: vi.fn() }
}))
const mockedGet = vi.mocked(axios.get)

type Handler = (args: Record<string, unknown>, context: unknown) => Promise<unknown>
const service = new AgentToolService()
registerWebAgentToolHandlers(service)
const run = (id: string, args: Record<string, unknown>): Promise<unknown> => {
  const handler = (
    service as unknown as { _handlers: Map<string, Handler> }
  )._handlers.get(id)
  if (!handler) throw new Error(`handler ${id} not registered`)
  return handler(args, { projectRoot: null })
}

const okHtml = (body: string, headers: Record<string, string> = {}) => ({
  status: 200,
  data: body,
  headers: { 'content-type': 'text/html', ...headers }
})

beforeEach(() => {
  mockedGet.mockReset()
  clearUrlProvenance()
  resetWebReadCounts()
})

// ---- isPrivateAddress ---------------------------------------------------------

describe('isPrivateAddress', () => {
  it('flags every range an SSRF must never reach', () => {
    for (const ip of [
      '127.0.0.1',
      '127.8.9.10',
      '10.0.0.5',
      '192.168.1.10',
      '169.254.169.254', // cloud metadata
      '172.16.0.1',
      '172.31.255.255',
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1', // ULA
      'fe80::1', // link-local
      '::ffff:127.0.0.1', // v4-mapped loopback
      '::ffff:10.0.0.1'
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('passes ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.128.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })

  it('treats unparseable input as unsafe', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true)
  })
})

// ---- assertSafeUrl literal-IP judgement -----------------------------------------

describe('assertSafeUrl (address-level checks)', () => {
  it('rejects literal private IPs the hostname regex alone would miss', () => {
    expect(() => assertSafeUrl('http://[fd00::1]/')).toThrow(/not allowed/i)
    expect(() => assertSafeUrl('http://100.64.0.1/')).toThrow(/not allowed/i)
  })

  it('still passes public literal IPs and hostnames', () => {
    expect(assertSafeUrl('http://93.184.216.34/x').hostname).toBe('93.184.216.34')
    expect(assertSafeUrl('https://example.com/x').hostname).toBe('example.com')
  })
})

// ---- makeSafeLookup (DNS rebinding) ----------------------------------------------

describe('makeSafeLookup', () => {
  const lookupWith = (
    addresses: Array<{ address: string; family: number }>,
    err: Error | null = null
  ) =>
    makeSafeLookup((_host, _options, callback) => {
      callback(err as never, addresses as never)
    })

  const invoke = (
    lookup: ReturnType<typeof makeSafeLookup>,
    options: { all?: boolean } = {}
  ): Promise<{ err: Error | null; result: unknown; family?: number }> =>
    new Promise((resolve) => {
      lookup('host.example', options as never, (err, result, family) =>
        resolve({ err: err as Error | null, result, family })
      )
    })

  it('refuses hosts that resolve to a private address (any of them)', async() => {
    const lookup = lookupWith([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 } // the rebind
    ])
    const { err } = await invoke(lookup)
    expect(err?.message).toMatch(/private address 127\.0\.0\.1/)
  })

  it('passes clean public resolutions through (single and all forms)', async() => {
    const lookup = lookupWith([{ address: '93.184.216.34', family: 4 }])
    const single = await invoke(lookup)
    expect(single.err).toBeNull()
    // axios accepts a LookupAddress object for the single form.
    expect(single.result).toEqual({ address: '93.184.216.34', family: 4 })
    expect(single.family).toBe(4)

    const all = await invoke(lookup, { all: true })
    expect(all.err).toBeNull()
    expect(all.result).toEqual([{ address: '93.184.216.34', family: 4 }])
  })

  it('propagates DNS errors and rejects empty resolutions', async() => {
    const failed = await invoke(lookupWith([], new Error('ENOTFOUND')))
    expect(failed.err?.message).toMatch(/ENOTFOUND/)

    const empty = await invoke(lookupWith([]))
    expect(empty.err?.message).toMatch(/no addresses/)
  })
})

// ---- web_search --------------------------------------------------------------------

describe('web_search handler', () => {
  const ddgPage =
    '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone&rut=x">One</a>' +
    '<a class="result__snippet" href="#">First snippet.</a>' +
    '<a class="result__a" href="https://example.com/two">Two</a>' +
    '<a class="result__snippet" href="#">Second snippet.</a>'

  it('queries DuckDuckGo and returns parsed results', async() => {
    mockedGet.mockResolvedValueOnce(okHtml(ddgPage))
    const result = (await run('web_search', { query: 'lighthouse history' })) as {
      query: string
      results: Array<{ title: string; url: string }>
      note?: string
    }
    expect(mockedGet).toHaveBeenCalledWith(
      'https://html.duckduckgo.com/html/',
      expect.objectContaining({ params: { q: 'lighthouse history' } })
    )
    expect(result.results).toHaveLength(2)
    expect(result.results[0].url).toBe('https://example.com/one')
    expect(result.note).toBeUndefined()
  })

  it('clamps maxResults to 10 and defaults to 5', async() => {
    const many = Array.from({ length: 12 })
      .map((_, i) => `<a class="result__a" href="https://example.com/${i}">R${i}</a>`)
      .join('')
    mockedGet.mockResolvedValueOnce(okHtml(many))
    const capped = (await run('web_search', { query: 'q', maxResults: 50 })) as {
      results: unknown[]
    }
    expect(capped.results.length).toBeLessThanOrEqual(10)

    mockedGet.mockResolvedValueOnce(okHtml(many))
    const defaulted = (await run('web_search', { query: 'q' })) as { results: unknown[] }
    expect(defaulted.results).toHaveLength(5)
  })

  it('empty results carry a corrective note for the model', async() => {
    mockedGet.mockResolvedValueOnce(okHtml('<html>no results markup</html>'))
    const result = (await run('web_search', { query: 'zzz' })) as { note?: string }
    expect(result.note).toMatch(/simpler query|web_fetch/)
  })

  it('rejects a missing query', async() => {
    await expect(run('web_search', {})).rejects.toThrow(/query/)
  })
})

// ---- web_fetch ----------------------------------------------------------------------

describe('web_fetch handler', () => {
  beforeEach(() => {
    // Provenance gate: these tests play the role of the writer having
    // pasted the URLs into chat.
    registerUrlProvenance(
      'https://example.com/page https://example.com/big.txt https://example.com/missing ' +
      'https://example.com/start https://example.com/evil https://example.com/loop ' +
      'https://example.com/x'
    )
  })

  it('fetches, reduces HTML to text, and pins DNS via the safe lookup', async() => {
    mockedGet.mockResolvedValueOnce(
      okHtml('<html><head><title>My Page</title></head><body><p>Hello &amp; welcome.</p></body></html>')
    )
    const result = (await run('web_fetch', { url: 'https://example.com/page' })) as {
      url: string
      status: number
      title: string
      text: string
      truncated: boolean
    }
    expect(result.status).toBe(200)
    expect(result.title).toBe('My Page')
    expect(result.text).toContain('Hello & welcome.')
    expect(result.truncated).toBe(false)

    const config = mockedGet.mock.calls[0][1] as Record<string, unknown>
    expect(typeof config.lookup).toBe('function') // DNS-pinned guard attached
    expect(config.maxRedirects).toBe(0) // axios never follows on its own
  })

  it('passes plain text through untouched and truncates huge bodies', async() => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: 'x'.repeat(25000),
      headers: { 'content-type': 'text/plain' }
    })
    const result = (await run('web_fetch', { url: 'https://example.com/big.txt' })) as {
      text: string
      truncated: boolean
      title: string
    }
    expect(result.text).toHaveLength(20000)
    expect(result.truncated).toBe(true)
    expect(result.title).toBe('')
  })

  it('reports HTTP errors as data, not crashes', async() => {
    mockedGet.mockResolvedValueOnce({ status: 404, data: '', headers: {} })
    const result = (await run('web_fetch', { url: 'https://example.com/missing' })) as {
      status: number
      error: string
    }
    expect(result.status).toBe(404)
    expect(result.error).toBe('HTTP 404')
  })

  it('follows redirects manually, resolving relative Locations', async() => {
    mockedGet
      .mockResolvedValueOnce({ status: 301, data: '', headers: { location: '/moved' } })
      .mockResolvedValueOnce({
        status: 302,
        data: '',
        headers: { location: 'https://other.example.com/final' }
      })
      .mockResolvedValueOnce(okHtml('<title>Landed</title>'))
    const result = (await run('web_fetch', { url: 'https://example.com/start' })) as {
      url: string
      title: string
    }
    expect(result.title).toBe('Landed')
    expect(result.url).toBe('https://other.example.com/final')
    // Hop 2 hit the RESOLVED relative URL.
    expect(mockedGet.mock.calls[1][0]).toBe('https://example.com/moved')
  })

  it('SSRF: a redirect into a private host is refused, not followed', async() => {
    mockedGet.mockResolvedValueOnce({
      status: 302,
      data: '',
      headers: { location: 'http://169.254.169.254/latest/meta-data' }
    })
    await expect(run('web_fetch', { url: 'https://example.com/evil' })).rejects.toThrow(
      /not allowed/i
    )
    expect(mockedGet).toHaveBeenCalledTimes(1) // never connected to the target
  })

  it('gives up after the redirect budget and flags missing Location', async() => {
    const hop = (n: number) => ({
      status: 302,
      data: '',
      headers: { location: `https://example.com/${n}` }
    })
    mockedGet
      .mockResolvedValueOnce(hop(1))
      .mockResolvedValueOnce(hop(2))
      .mockResolvedValueOnce(hop(3))
      .mockResolvedValueOnce(hop(4))
    const exhausted = (await run('web_fetch', { url: 'https://example.com/loop' })) as {
      error: string
    }
    expect(exhausted.error).toMatch(/redirects/)

    mockedGet.mockResolvedValueOnce({ status: 302, data: '', headers: {} })
    const dangling = (await run('web_fetch', { url: 'https://example.com/x' })) as {
      error: string
    }
    expect(dangling.error).toMatch(/Location/)
  })

  it('refuses private URLs outright (no request made)', async() => {
    await expect(run('web_fetch', { url: 'http://127.0.0.1:8080/' })).rejects.toThrow(
      /not allowed/i
    )
    await expect(run('web_fetch', { url: 'file:///etc/passwd' })).rejects.toThrow(/http/)
    expect(mockedGet).not.toHaveBeenCalled()
  })
})

// ---- URL provenance (Anthropic web_fetch pattern) -----------------------------

describe('web content cache (research is never re-downloaded)', () => {
  let root: string
  const cacheDir = (): string => path.join(root, '.wordbird', 'agent-state', 'web-cache')
  const runRooted = (id: string, args: Record<string, unknown>): Promise<unknown> => {
    const handler = (
      service as unknown as { _handlers: Map<string, Handler> }
    )._handlers.get(id)!
    return handler(args, { projectRoot: root })
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-webcache-'))
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('the second fetch of the same URL is served from disk (one network call)', async() => {
    registerUrlProvenance('https://cache.example.com/page')
    mockedGet.mockResolvedValue(okHtml('<title>Cached</title><p>body text</p>'))
    const first = (await runRooted('web_fetch', { url: 'https://cache.example.com/page' })) as {
      cached?: boolean
    }
    expect(first.cached).toBeUndefined()
    const second = (await runRooted('web_fetch', { url: 'https://cache.example.com/page' })) as {
      cached?: boolean
      title: string
      fetchedAt: number
    }
    expect(second.cached).toBe(true)
    expect(second.title).toBe('Cached')
    expect(second.fetchedAt).toBeGreaterThan(0)
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('SECURITY ORDERING pin: a cache hit needs no provenance (no network); a miss still does', async() => {
    registerUrlProvenance('https://cache.example.com/page')
    mockedGet.mockResolvedValue(okHtml('<title>Cached</title>'))
    await runRooted('web_fetch', { url: 'https://cache.example.com/page' })

    // New conversation: provenance wiped, but the cached body is reachable
    // WITHOUT any network request — the SSRF surface never opens.
    clearUrlProvenance()
    mockedGet.mockClear()
    const cached = (await runRooted('web_fetch', { url: 'https://cache.example.com/page' })) as {
      cached?: boolean
    }
    expect(cached.cached).toBe(true)
    expect(mockedGet).not.toHaveBeenCalled()

    // An UNcached URL without provenance is still refused before any request.
    await expect(
      runRooted('web_fetch', { url: 'https://never-seen.example.com/x' })
    ).rejects.toThrow(/did not come from the writer|search result/i)
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('TTL expiry re-fetches; refresh: true bypasses even a fresh entry', async() => {
    registerUrlProvenance('https://cache.example.com/page')
    mockedGet.mockResolvedValue(okHtml('<title>Cached</title>'))
    await runRooted('web_fetch', { url: 'https://cache.example.com/page' })

    // Age the entry past the TTL by rewriting its fetchedAt.
    const [entryName] = fs.readdirSync(cacheDir())
    const entryPath = path.join(cacheDir(), entryName)
    const entry = JSON.parse(fs.readFileSync(entryPath, 'utf8'))
    entry.fetchedAt = Date.now() - WEB_CACHE_TTL_MS - 1000
    fs.writeFileSync(entryPath, JSON.stringify(entry))

    await runRooted('web_fetch', { url: 'https://cache.example.com/page' })
    expect(mockedGet).toHaveBeenCalledTimes(2)

    await runRooted('web_fetch', { url: 'https://cache.example.com/page', refresh: true })
    expect(mockedGet).toHaveBeenCalledTimes(3)
  })

  it('wiki_read articles are cached too', async() => {
    const article = {
      status: 200,
      headers: {},
      data: { query: { pages: { 1: { title: 'Lighthouse', extract: 'A tower with a light.' } } } }
    }
    mockedGet.mockResolvedValue(article)
    await runRooted('wiki_read', { title: 'Lighthouse' })
    const second = (await runRooted('wiki_read', { title: 'Lighthouse' })) as {
      cached?: boolean
      text: string
    }
    expect(second.cached).toBe(true)
    expect(second.text).toContain('tower')
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('NO entry cap (disk is not a constraint) — only TTL-expired entries are cleaned', async() => {
    fs.mkdirSync(cacheDir(), { recursive: true })
    // 300 fresh entries + 5 expired ones.
    for (let i = 0; i < 300; i++) {
      fs.writeFileSync(
        path.join(cacheDir(), `fresh-${String(i).padStart(4, '0')}.json`),
        JSON.stringify({ fetchedAt: Date.now() })
      )
    }
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(cacheDir(), `stale-${i}.json`),
        JSON.stringify({ fetchedAt: Date.now() - WEB_CACHE_TTL_MS - 1000 })
      )
    }
    registerUrlProvenance('https://cache.example.com/new')
    mockedGet.mockResolvedValue(okHtml('<title>New</title>'))
    await runRooted('web_fetch', { url: 'https://cache.example.com/new' })
    const remaining = fs.readdirSync(cacheDir())
    expect(remaining.length).toBe(301) // 300 fresh + the new one; ALL fresh kept
    expect(remaining.some((name) => name.startsWith('stale-'))).toBe(false)
  })

  it('the cache stores FULL text; only the model-facing return is capped', async() => {
    registerUrlProvenance('https://cache.example.com/long')
    const longBody = `<title>Long</title><p>${'word '.repeat(9000)}</p>`
    mockedGet.mockResolvedValue(okHtml(longBody))
    const returned = (await runRooted('web_fetch', { url: 'https://cache.example.com/long' })) as {
      text: string
      truncated: boolean
    }
    expect(returned.truncated).toBe(true)
    expect(returned.text.length).toBeLessThanOrEqual(20000)
    // The disk entry keeps everything.
    const [entryName] = fs.readdirSync(cacheDir())
    const entry = JSON.parse(fs.readFileSync(path.join(cacheDir(), entryName), 'utf8'))
    expect(entry.text.length).toBeGreaterThan(20000)
  })

  it('re-reading the same page in one turn earns an escalating stop-thrashing note', async() => {
    registerUrlProvenance('https://cache.example.com/thrash')
    mockedGet.mockResolvedValue(okHtml('<title>Same</title>'))
    const first = (await runRooted('web_fetch', { url: 'https://cache.example.com/thrash' })) as {
      repeatRead?: number
    }
    expect(first.repeatRead).toBeUndefined()
    await runRooted('web_fetch', { url: 'https://cache.example.com/thrash' })
    const third = (await runRooted('web_fetch', { url: 'https://cache.example.com/thrash' })) as {
      repeatRead?: number
      note?: string
    }
    expect(third.repeatRead).toBe(3)
    expect(third.note).toMatch(/3 times this turn/i)
    // A new writer turn starts clean.
    resetWebReadCounts()
    const fresh = (await runRooted('web_fetch', { url: 'https://cache.example.com/thrash' })) as {
      repeatRead?: number
    }
    expect(fresh.repeatRead).toBeUndefined()
  })

  it('identical searches within a turn are memoized (one network call + nudge)', async() => {
    mockedGet.mockResolvedValue(
      okHtml('<a class="result__a" href="https://memo.example.com/hit">Hit</a>')
    )
    await runRooted('web_search', { query: 'Elam ancient civilization' })
    const second = (await runRooted('web_search', {
      query: '  elam ANCIENT civilization '
    })) as { cached?: boolean; note?: string; results: Array<{ url: string }> }
    expect(second.cached).toBe(true)
    expect(second.note).toMatch(/2 times this turn/i)
    expect(second.results[0].url).toContain('memo.example.com')
    expect(mockedGet).toHaveBeenCalledTimes(1)
    // A new turn searches live again.
    resetWebReadCounts()
    await runRooted('web_search', { query: 'Elam ancient civilization' })
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('parallel identical fetches share ONE network call (in-flight coalescing)', async() => {
    registerUrlProvenance('https://cache.example.com/parallel')
    let resolveResponse: (value: unknown) => void = () => {}
    mockedGet.mockImplementation(
      () => new Promise((resolve) => {
        resolveResponse = resolve
      })
    )
    const first = runRooted('web_fetch', { url: 'https://cache.example.com/parallel' })
    const second = runRooted('web_fetch', { url: 'https://cache.example.com/parallel' })
    resolveResponse(okHtml('<title>Shared</title>'))
    const [a, b] = (await Promise.all([first, second])) as Array<{ title: string }>
    expect(a.title).toBe('Shared')
    expect(b.title).toBe('Shared')
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})

describe('per-turn lookup budget (research must END)', () => {
  it('past the budget, live lookups stop and demand a save; cache hits stay free', async() => {
    mockedGet.mockResolvedValue(okHtml('<title>Page</title>'))
    for (let i = 0; i < WEB_TURN_LOOKUP_BUDGET; i++) {
      registerUrlProvenance(`https://budget.example.com/${i}`)
      await run('web_fetch', { url: `https://budget.example.com/${i}` })
    }
    expect(mockedGet).toHaveBeenCalledTimes(WEB_TURN_LOOKUP_BUDGET)
    // The next LIVE lookup is refused without network…
    registerUrlProvenance('https://budget.example.com/over')
    const over = (await run('web_fetch', { url: 'https://budget.example.com/over' })) as {
      budgetExhausted?: boolean
      note?: string
    }
    expect(over.budgetExhausted).toBe(true)
    expect(over.note).toMatch(/save_research/i)
    expect(mockedGet).toHaveBeenCalledTimes(WEB_TURN_LOOKUP_BUDGET)
    // …and searches are refused too…
    const search = (await run('web_search', { query: 'anything else' })) as {
      budgetExhausted?: boolean
    }
    expect(search.budgetExhausted).toBe(true)
    // …but a new turn starts fresh.
    resetWebReadCounts()
    mockedGet.mockClear()
    mockedGet.mockResolvedValue(okHtml('<title>Fresh</title>'))
    registerUrlProvenance('https://budget.example.com/fresh')
    const fresh = (await run('web_fetch', { url: 'https://budget.example.com/fresh' })) as {
      budgetExhausted?: boolean
    }
    expect(fresh.budgetExhausted).toBeUndefined()
  })
})

describe('rate-limit tolerance (no writer intervention)', () => {
  const originalDelays = [...WEB_RETRY_DELAYS_MS]
  beforeEach(() => {
    // Instant retries in tests.
    WEB_RETRY_DELAYS_MS.splice(0, WEB_RETRY_DELAYS_MS.length, 1, 1, 1)
  })
  afterEach(() => {
    WEB_RETRY_DELAYS_MS.splice(0, WEB_RETRY_DELAYS_MS.length, ...originalDelays)
  })

  it('a 429 then success succeeds without surfacing an error (search path)', async() => {
    mockedGet
      .mockResolvedValueOnce({ status: 429, data: '', headers: {} })
      .mockResolvedValueOnce(
        okHtml('<a class="result__a" href="https://ok.example.com/a">Hit</a>')
      )
    const result = (await run('web_search', { query: 'storms' })) as {
      results: Array<{ url: string }>
    }
    expect(result.results[0].url).toContain('ok.example.com')
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('thrown 429s (axios reject shape) retry too, honoring the attempt budget', async() => {
    const rateLimited = Object.assign(new Error('Request failed with status code 429'), {
      response: { status: 429 }
    })
    mockedGet
      .mockRejectedValueOnce(rateLimited)
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { query: { pages: { 1: { title: 'Tide', extract: 'Rise and fall.' } } } }
      })
    const result = (await run('wiki_read', { title: 'Tide' })) as { found: boolean }
    expect(result.found).toBe(true)
    expect(mockedGet).toHaveBeenCalledTimes(3)
  })

  it('non-retryable failures still fail fast (no infinite patience)', async() => {
    mockedGet.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 }
      })
    )
    await expect(run('wiki_search', { query: 'x' })).rejects.toThrow()
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})

describe('web_fetch URL provenance', () => {
  it('refuses a URL the model invented — no request is made', async() => {
    await expect(run('web_fetch', { url: 'https://guessed.example.com/page' })).rejects.toThrow(
      /did not come from the writer|search result/i
    )
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('a search result becomes fetchable (the intended search→fetch loop)', async() => {
    mockedGet.mockResolvedValueOnce(
      okHtml('<a class="result__a" href="https://found.example.com/article">Hit</a>')
    )
    await run('web_search', { query: 'lighthouse' })

    mockedGet.mockResolvedValueOnce(okHtml('<title>Found</title>'))
    const fetched = (await run('web_fetch', { url: 'https://found.example.com/article' })) as {
      title: string
    }
    expect(fetched.title).toBe('Found')
  })

  it('wiki results register provenance too', async() => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { pages: [{ title: 'Tide', key: 'Tide', description: '', excerpt: '' }] }
    })
    await run('wiki_search', { query: 'tide' })
    mockedGet.mockResolvedValueOnce(okHtml('<title>Tide</title>'))
    await expect(
      run('web_fetch', { url: 'https://en.wikipedia.org/wiki/Tide' })
    ).resolves.toBeTruthy()
  })

  it('writer-pasted URLs are extracted from prose, hash-insensitively', async() => {
    registerUrlProvenance('please read https://a.example.com/x?q=1#section-2, thanks!')
    mockedGet.mockResolvedValueOnce(okHtml('<title>A</title>'))
    const result = (await run('web_fetch', { url: 'https://a.example.com/x?q=1' })) as {
      title: string
    }
    expect(result.title).toBe('A')
  })

  it('clearing provenance (conversation switch) revokes fetchability', async() => {
    registerUrlProvenance('https://b.example.com/y')
    clearUrlProvenance()
    await expect(run('web_fetch', { url: 'https://b.example.com/y' })).rejects.toThrow(
      /did not come from/i
    )
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('the registry is capped FIFO — oldest URLs age out', async() => {
    registerUrlProvenance('https://first.example.com/0')
    for (let i = 1; i <= MAX_KNOWN_URLS; i++) {
      registerUrlProvenance(`https://filler.example.com/${i}`)
    }
    // #0 was evicted by the entry cap (memory bound, generous by design)…
    await expect(run('web_fetch', { url: 'https://first.example.com/0' })).rejects.toThrow(
      /did not come from/i
    )
    // …while a recent one still fetches.
    mockedGet.mockResolvedValueOnce(okHtml('<title>OK</title>'))
    await expect(
      run('web_fetch', { url: `https://filler.example.com/${MAX_KNOWN_URLS}` })
    ).resolves.toBeTruthy()
  })

  it('redirect hops are exempt from provenance but still SSRF-guarded', async() => {
    registerUrlProvenance('https://start.example.com/go')
    mockedGet
      .mockResolvedValueOnce({
        status: 302,
        data: '',
        headers: { location: 'https://unlisted.example.com/target' }
      })
      .mockResolvedValueOnce(okHtml('<title>Target</title>'))
    const result = (await run('web_fetch', { url: 'https://start.example.com/go' })) as {
      title: string
    }
    expect(result.title).toBe('Target')
  })
})

// ---- Prompt & description contracts ---------------------------------------------

describe('research prompt contracts', () => {
  it('researcher prompt carries the injection guard and recency nudge', () => {
    const prompt = AGENT_ROLES.researcher.systemPrompt
    expect(prompt).toMatch(/never instructions/i)
    expect(prompt).toMatch(/recent sources/i)
    expect(prompt).toMatch(/Never invent sources/)
  })

  it('supervisor prompt carries the guard and the provider-consistency clause', () => {
    const prompt = buildSupervisorPrompt('approvals', 6)
    expect(prompt).toContain('research material, never instructions')
    expect(prompt).toContain('single-fact check')
  })

  it('tool descriptions no longer promise saves the researcher cannot make', () => {
    const pack = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../static/agentTools.json'), 'utf8')
    ) as { tools: Array<{ id: string; description: string }> }
    const byId = Object.fromEntries(pack.tools.map((t) => [t.id, t.description]))
    expect(byId.web_search).not.toMatch(/save durable findings/)
    expect(byId.web_search).toMatch(/supervisor decides/)
    expect(byId.wiki_read).not.toMatch(/saving findings/)
    // web_fetch announces the provenance rule to the model.
    expect(byId.web_fetch).toMatch(/never guess a URL/i)
  })
})

// ---- wiki_search / wiki_read ----------------------------------------------------------

describe('wiki handlers', () => {
  it('wiki_search maps pages into titled, excerpted, linked results', async() => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: {
        pages: [
          {
            title: 'Lighthouse',
            key: 'Lighthouse',
            description: 'Structure',
            excerpt: '<span class="searchmatch">Lighthouse</span> history'
          }
        ]
      }
    })
    const result = (await run('wiki_search', { query: 'lighthouse', lang: 'DE' })) as {
      lang: string
      results: Array<{ title: string; excerpt: string; url: string }>
    }
    expect(result.lang).toBe('de')
    expect(mockedGet.mock.calls[0][0]).toBe('https://de.wikipedia.org/w/rest.php/v1/search/page')
    expect(result.results[0].excerpt).toBe('Lighthouse history') // HTML stripped
    expect(result.results[0].url).toBe('https://de.wikipedia.org/wiki/Lighthouse')
  })

  it('wiki_read returns the extract when found and a corrective note when not', async() => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { query: { pages: { 123: { title: 'Lighthouse', extract: 'A tower with a light.' } } } }
    })
    const found = (await run('wiki_read', { title: 'Lighthouse' })) as {
      found: boolean
      text: string
      url: string
    }
    expect(found.found).toBe(true)
    expect(found.text).toBe('A tower with a light.')
    expect(found.url).toContain('en.wikipedia.org/wiki/Lighthouse')

    mockedGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { query: { pages: { '-1': { title: 'Nope', missing: '' } } } }
    })
    const missing = (await run('wiki_read', { title: 'Nope' })) as { found: boolean; note: string }
    expect(missing.found).toBe(false)
    expect(missing.note).toMatch(/wiki_search/)
  })

  it('rejects hostile language codes at the handler boundary', async() => {
    await expect(run('wiki_search', { query: 'x', lang: 'evil.com/#' })).rejects.toThrow(
      /language/i
    )
    expect(mockedGet).not.toHaveBeenCalled()
  })
})

// ---- dictionary_lookup -------------------------------------------------------------------

describe('dictionary_lookup handler', () => {
  it('returns capped meanings for a real word (lowercased in the request)', async() => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: [
        {
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [{ definition: 'A tall coastal tower.' }],
              synonyms: ['beacon'],
              antonyms: []
            }
          ]
        }
      ]
    })
    const result = (await run('dictionary_lookup', { word: 'Lighthouse' })) as {
      found: boolean
      meanings: Array<{ partOfSpeech: string; definitions: string[]; synonyms: string[] }>
    }
    expect(mockedGet.mock.calls[0][0]).toContain('/entries/en/lighthouse')
    expect(result.found).toBe(true)
    expect(result.meanings[0].partOfSpeech).toBe('noun')
    expect(result.meanings[0].synonyms).toContain('beacon')
  })

  it('handles unknown words and service errors as data', async() => {
    mockedGet.mockResolvedValueOnce({ status: 404, headers: {}, data: {} })
    const unknown = (await run('dictionary_lookup', { word: 'zzzzz' })) as {
      found: boolean
      note: string
    }
    expect(unknown.found).toBe(false)
    expect(unknown.note).toMatch(/spelling/)

    mockedGet.mockResolvedValueOnce({ status: 500, headers: {}, data: 'oops' })
    const broken = (await run('dictionary_lookup', { word: 'fine' })) as { note: string }
    expect(broken.note).toMatch(/HTTP 500/)
  })

  it('rejects multi-word and injection-shaped input before any request', async() => {
    await expect(run('dictionary_lookup', { word: 'two words' })).rejects.toThrow(/single word/)
    await expect(run('dictionary_lookup', { word: '../etc' })).rejects.toThrow(/single word/)
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
