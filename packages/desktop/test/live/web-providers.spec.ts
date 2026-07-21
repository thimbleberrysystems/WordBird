/**
 * LIVE NETWORK tests for the research providers — real endpoints, NO model.
 *
 * These cost nothing (no tokens) but catch what mocked unit tests cannot:
 * an endpoint changing its response shape, starting to throttle us, or
 * disappearing. That is exactly how the DuckDuckGo problem hid — the unit
 * suite mocked a 200 with results while the live endpoint was answering
 * 202-with-nothing on every request.
 *
 * Skipped when the machine is offline so a plane-mode `pnpm run test:live`
 * does not report false failures.
 *
 *   pnpm -C packages/desktop exec vitest run --config vitest.live.config.ts \
 *     test/live/web-providers.spec.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  registerWebAgentToolHandlers,
  resetWebReadCounts,
  prefersEncyclopedic,
  providersFor
} from '../../src/main/services/ai/WebToolHandlers'
import { AgentToolService } from '../../src/main/services/ai/AgentToolService'

let online = false
beforeAll(async() => {
  try {
    const response = await fetch('https://en.wikipedia.org/w/api.php?action=query&format=json', {
      signal: AbortSignal.timeout(8000)
    })
    online = response.ok
  } catch {
    online = false
  }
})

const service = new AgentToolService()
registerWebAgentToolHandlers(service)

type Handler = (args: Record<string, unknown>, context: unknown) => Promise<unknown>
const run = async(id: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const handler = (service as unknown as { _handlers: Map<string, Handler> })._handlers.get(id)
  if (!handler) throw new Error(`handler ${id} not registered`)
  resetWebReadCounts()
  return (await handler(args, { projectRoot: null })) as Record<string, unknown>
}

const liveNet = describe

liveNet('research providers (real network, zero tokens)', () => {
  it('web_search answers an ENCYCLOPEDIC query and says which provider did', async() => {
    if (!online) return
    const result = await run('web_search', { query: 'sukkalmah dynasty elam' })
    const results = (result.results ?? []) as Array<{ url: string; title: string }>
    expect(
      results.length,
      `no provider answered (rateLimited=${String(result.rateLimited)}, note=${String(result.note)})`
    ).toBeGreaterThan(0)
    // Attribution is the point of rotation — a thin answer must be traceable.
    expect(typeof result.provider).toBe('string')
    expect(results[0].url).toMatch(/^https?:\/\//)
  }, 120_000)

  it('web_search survives the query shape that used to come back empty', async() => {
    if (!online) return
    // A plain web query: DuckDuckGo's scrape endpoint answers 202-with-
    // nothing under load, so this only passes because another provider
    // picks it up. This is the writer-reported failure, pinned.
    const result = await run('web_search', { query: 'lighthouse keeper daily routine 1890s' })
    const results = (result.results ?? []) as unknown[]
    expect(
      results.length,
      `every provider came back empty (note=${String(result.note)})`
    ).toBeGreaterThan(0)
  }, 120_000)

  it('search_books returns real catalogue rows', async() => {
    if (!online) return
    const result = await run('search_books', { query: 'ancient elam', maxResults: 3 })
    const results = (result.results ?? []) as Array<{ title: string; url: string }>
    expect(result.source).toBe('openlibrary')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title.length).toBeGreaterThan(0)
    expect(results[0].url).toContain('openlibrary.org')
  }, 120_000)

  it('search_papers returns real citations with DOIs', async() => {
    if (!online) return
    const result = await run('search_papers', { query: 'elamite language', maxResults: 3 })
    const results = (result.results ?? []) as Array<{ title: string; doi: string | null }>
    expect(result.source).toBe('crossref')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((row) => row.doi)).toBe(true)
  }, 120_000)

  it('wiki_search + wiki_read still work end to end', async() => {
    if (!online) return
    const search = await run('wiki_search', { query: 'Elam' })
    const hits = (search.results ?? []) as Array<{ title: string }>
    expect(hits.length).toBeGreaterThan(0)
    const article = await run('wiki_read', { title: 'Elam' })
    expect(String(article.text ?? '').length).toBeGreaterThan(500)
  }, 120_000)

  it('provider ORDER matches the query kind (pure, no network)', () => {
    expect(prefersEncyclopedic('sukkalmah dynasty')).toBe(true)
    expect(providersFor('sukkalmah dynasty')[0].name).toBe('wikipedia')
    expect(prefersEncyclopedic('best noise cancelling headphones review')).toBe(false)
    expect(providersFor('best noise cancelling headphones review')[0].name).toBe('duckduckgo-html')
    // Every order must still contain all three providers — a typo that
    // dropped one would silently remove a fallback.
    for (const query of ['sukkalmah dynasty', 'latest news today']) {
      expect(providersFor(query)).toHaveLength(3)
    }
  })
})
