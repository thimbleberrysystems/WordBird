/**
 * Web research tools for Biscuit: `web_search` (DuckDuckGo HTML, no API
 * key) and `web_fetch` (fetch a page and reduce it to readable text).
 *
 * Guardrails: http(s) only, no credentials in URLs, private/loopback
 * hosts rejected, response size and time capped, HTML reduced to text
 * before it reaches the model.
 */

import axios from 'axios'
import type { AgentToolContext, AgentToolService } from './AgentToolService'

const MAX_RESPONSE_BYTES = 1_500_000
const FETCH_TIMEOUT_MS = 15000
const MAX_TEXT_CHARS = 20000
const USER_AGENT = 'WordBird-Biscuit/1.0 (novel research assistant)'

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
  return url
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

const webFetch = async(
  args: Record<string, unknown>,
  _context: AgentToolContext
): Promise<unknown> => {
  const url = assertSafeUrl(str(args, 'url'))

  const response = await axios.get(url.toString(), {
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxRedirects: 3,
    responseType: 'text',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain,*/*;q=0.8' },
    // Treat every status as resolved so we can report it cleanly.
    validateStatus: () => true
  })

  if (response.status >= 400) {
    return { url: url.toString(), status: response.status, error: `HTTP ${response.status}` }
  }

  const body = String(response.data ?? '')
  const contentType = String(response.headers['content-type'] ?? '')
  const isHtml = contentType.includes('html') || /^\s*</.test(body)
  const text = isHtml ? htmlToText(body) : body

  return {
    url: url.toString(),
    status: response.status,
    title: isHtml ? extractTitle(body) : '',
    text: text.slice(0, MAX_TEXT_CHARS),
    truncated: text.length > MAX_TEXT_CHARS
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

  const response = await axios.get('https://html.duckduckgo.com/html/', {
    params: { q: query },
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    responseType: 'text',
    headers: { 'User-Agent': USER_AGENT }
  })

  const results = parseDuckDuckGoHtml(String(response.data ?? '')).slice(0, maxResults)
  return {
    query,
    results,
    note:
      results.length === 0
        ? 'No results parsed. Try a simpler query, or use web_fetch on a known URL.'
        : undefined
  }
}

export const registerWebAgentToolHandlers = (service: AgentToolService): void => {
  service.registerHandler('web_search', webSearch)
  service.registerHandler('web_fetch', webFetch)
}
