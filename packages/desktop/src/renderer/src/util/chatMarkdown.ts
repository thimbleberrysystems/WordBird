/**
 * Markdown rendering for the Biscuit chat transcript.
 *
 * Assistant replies are markdown-rich (bold, lists, headings); rendering
 * them as plain text made them unreadable. This renders a SAFE subset:
 * marked (gfm + breaks) → DOMPurify with an allow-list of formatting tags,
 * links forced to open externally with safe rel attributes, and no
 * images/media/forms at all.
 */

import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true,
  async: false
})

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td'
]

const ALLOWED_ATTR = ['href', 'start']

// Links open in the system browser (the app intercepts external targets);
// force safe attributes on every anchor DOMPurify lets through.
let hookInstalled = false
const installHook = (): void => {
  if (hookInstalled) return
  hookInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      if (!/^https?:\/\//i.test(href)) {
        // javascript:, file:, relative — neuter to plain text behavior.
        node.removeAttribute('href')
        return
      }
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

export const renderChatMarkdown = (text: string): string => {
  installHook()
  const html = marked.parse(text ?? '', { async: false }) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false
  })
}
