/**
 * Web research tools, handler-level: every tool (web_search, web_fetch,
 * wiki_search, wiki_read, dictionary_lookup) exercised over a mocked
 * axios — no network — plus the SSRF hardening this suite exists to
 * lock down: private-address detection, DNS-pinned lookups (rebinding),
 * and manual redirect following with every hop re-guarded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import {
  assertSafeUrl,
  isPrivateAddress,
  makeSafeLookup,
  registerWebAgentToolHandlers
} from '../../../src/main/services/ai/WebToolHandlers'
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
