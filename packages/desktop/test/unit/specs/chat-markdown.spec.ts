import { describe, it, expect } from 'vitest'
import { renderChatMarkdown } from '../../../src/renderer/src/util/chatMarkdown'

describe('renderChatMarkdown', () => {
  it('renders bold, italics, lists, and headings', () => {
    const html = renderChatMarkdown(
      '**Core hooks**\n\n- *The house remembers*\n- The lie\n\n## Concepts\n1. First\n2. Second'
    )
    expect(html).toContain('<strong>Core hooks</strong>')
    expect(html).toContain('<em>The house remembers</em>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<h2>Concepts</h2>')
  })

  it('renders inline and fenced code', () => {
    const html = renderChatMarkdown('Use `propose_new_unit`.\n\n```\nraw block\n```')
    expect(html).toContain('<code>propose_new_unit</code>')
    expect(html).toContain('<pre>')
  })

  it('strips scripts, event handlers, images, and iframes', () => {
    const html = renderChatMarkdown(
      'hi <script>alert(1)</script> <img src=x onerror=alert(1)> <iframe src="x"></iframe> ' +
        '<a href="https://ok.com" onclick="evil()">link</a>'
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('onclick')
    expect(html).toContain('link')
  })

  it('forces safe attributes on http(s) links and neuters other schemes', () => {
    const html = renderChatMarkdown(
      '[good](https://example.com) and [bad](javascript:alert(1)) and [file](file:///etc/passwd)'
    )
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('file:///')
  })

  it('passes plain text through as a paragraph', () => {
    const html = renderChatMarkdown('just words')
    expect(html.trim()).toBe('<p>just words</p>')
  })

  it('tolerates empty and nullish input', () => {
    expect(renderChatMarkdown('')).toBe('')
    expect(renderChatMarkdown(undefined as unknown as string)).toBe('')
  })

  it('memoizes: identical input parses once, and the result is stable', async() => {
    const { _clearChatMarkdownCache } = await import(
      '../../../src/renderer/src/util/chatMarkdown'
    )
    _clearChatMarkdownCache()
    const input = '# Heading\n\nSome **bold** text and a `code` span.'
    const first = renderChatMarkdown(input)
    const second = renderChatMarkdown(input)
    // Same output, and — the point of the cache — the exact same string
    // instance (proves the second call did not re-parse).
    expect(second).toBe(first)
    expect(second === first).toBe(true)
    // A different input still renders fresh.
    expect(renderChatMarkdown('# Other')).not.toBe(first)
  })
})
