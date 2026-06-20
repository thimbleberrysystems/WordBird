import { describe, it, expect, beforeEach, vi } from 'vitest'
import { injectInlineDiff, findEditorRoot } from '../../../src/renderer/src/services/agentDiffDom'

/**
 * Build a DOM that mirrors Muya's real structure:
 *   container
 *     └── div#ag-editor-id        (the inner editor root — blocks live here)
 *           ├── p (paragraph block)
 *           ├── h2 (heading block)
 *           └── ...
 * The blocks are NOT direct children of `container`; they are children of the
 * inner #ag-editor-id div. This is the structure injectInlineDiff must target.
 */
function buildMuyaDom(blocks: Array<{ tag: string; text: string }>): HTMLElement {
  const container = document.createElement('div')
  container.className = 'editor-component'
  const root = document.createElement('div')
  root.id = 'ag-editor-id'
  for (const b of blocks) {
    const el = document.createElement(b.tag)
    el.textContent = b.text
    root.appendChild(el)
  }
  container.appendChild(root)
  document.body.appendChild(container)
  return container
}

const fileCbs = { onAcceptFile: () => {}, onDiscardFile: () => {} }

describe('findEditorRoot', () => {
  it('returns the inner #ag-editor-id div, not the outer container', () => {
    const container = buildMuyaDom([{ tag: 'p', text: 'hi' }])
    expect(findEditorRoot(container).id).toBe('ag-editor-id')
  })
})

describe('injectInlineDiff', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('hides the changed block and injects the hunk in its place', () => {
    const container = buildMuyaDom([
      { tag: 'p', text: 'First paragraph.' },
      { tag: 'p', text: 'Second paragraph.' },
      { tag: 'p', text: 'Third paragraph.' }
    ])
    const root = findEditorRoot(container)

    const handle = injectInlineDiff(
      container,
      'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
      'First paragraph.\n\nSecond paragraph EDITED.\n\nThird paragraph.',
      fileCbs
    )
    expect(handle).not.toBeNull()

    const second = Array.from(root.querySelectorAll('p')).find(
      (b) => b.textContent === 'Second paragraph.'
    )!
    expect(second.classList.contains('wb-diff-hidden')).toBe(true)

    const removed = Array.from(root.querySelectorAll('.wb-diff-line--removed')).map(
      (el) => el.querySelector('.wb-diff-line__text')!.textContent
    )
    const added = Array.from(root.querySelectorAll('.wb-diff-line--added')).map(
      (el) => el.querySelector('.wb-diff-line__text')!.textContent
    )
    expect(removed).toContain('Second paragraph.')
    expect(added).toContain('Second paragraph EDITED.')
  })

  it('injects into the inner root, not appended to the outer container', () => {
    const container = buildMuyaDom([
      { tag: 'p', text: 'Alpha.' },
      { tag: 'p', text: 'Beta.' }
    ])
    const root = findEditorRoot(container)

    injectInlineDiff(container, 'Alpha.\n\nBeta.', 'Alpha.\n\nBeta CHANGED.', fileCbs)

    expect(root.querySelector('.wb-diff-hunk')).not.toBeNull()
    const stray = Array.from(container.children).filter(
      (c) => (c as HTMLElement).dataset?.wbDiffInjected === '1'
    )
    expect(stray.length).toBe(0)
  })

  it('renders a file-level header with Accept All / Discard All and the change count', () => {
    const container = buildMuyaDom([
      { tag: 'p', text: 'A.' },
      { tag: 'p', text: 'B.' },
      { tag: 'p', text: 'C.' }
    ])
    const root = findEditorRoot(container)
    const onAcceptFile = vi.fn()
    const onDiscardFile = vi.fn()

    injectInlineDiff(container, 'A.\n\nB.\n\nC.', 'A.\n\nB2.\n\nC2.', {
      onAcceptFile,
      onDiscardFile
    })

    const codelens = root.querySelector('.wb-diff-codelens')!
    expect(codelens).not.toBeNull()
    // two separate changed paragraphs => "2 changes"
    expect(codelens.querySelector('.wb-diff-codelens__label')!.textContent).toContain('2 changes')
    ;(codelens.querySelector('.wb-diff-btn--accept') as HTMLButtonElement).click()
    expect(onAcceptFile).toHaveBeenCalledOnce()
    ;(codelens.querySelector('.wb-diff-btn--discard') as HTMLButtonElement).click()
    expect(onDiscardFile).toHaveBeenCalledOnce()
  })

  it('renders one hunk block per change, each with its own Accept/Discard', () => {
    const container = buildMuyaDom([
      { tag: 'p', text: 'A.' },
      { tag: 'p', text: 'B.' },
      { tag: 'p', text: 'C.' }
    ])
    const root = findEditorRoot(container)
    const onAcceptHunk = vi.fn()
    const onDiscardHunk = vi.fn()

    injectInlineDiff(container, 'A.\n\nB.\n\nC.', 'A.\n\nB2.\n\nC2.', {
      ...fileCbs,
      onAcceptHunk,
      onDiscardHunk
    })

    const hunks = Array.from(root.querySelectorAll('.wb-diff-hunk'))
    expect(hunks).toHaveLength(2)

    // First hunk's Accept fires with index 0
    ;(hunks[0].querySelector('.wb-diff-hunk__actions .wb-diff-btn--accept') as HTMLButtonElement).click()
    expect(onAcceptHunk).toHaveBeenCalledWith(0)

    // Second hunk's Discard fires with index 1
    ;(hunks[1].querySelector('.wb-diff-hunk__actions .wb-diff-btn--discard') as HTMLButtonElement).click()
    expect(onDiscardHunk).toHaveBeenCalledWith(1)
  })

  it('omits per-hunk headers when no per-hunk callbacks are given', () => {
    const container = buildMuyaDom([{ tag: 'p', text: 'Old.' }])
    const root = findEditorRoot(container)

    injectInlineDiff(container, 'Old.', 'New.', fileCbs)

    expect(root.querySelector('.wb-diff-hunk__header')).toBeNull()
    expect(root.querySelector('.wb-diff-hunk__lines')).not.toBeNull()
  })

  it('matches a heading block despite the markdown # prefix', () => {
    const container = buildMuyaDom([
      { tag: 'h1', text: 'Old Title' },
      { tag: 'p', text: 'Body text.' }
    ])
    const root = findEditorRoot(container)

    injectInlineDiff(container, '# Old Title\n\nBody text.', '# New Title\n\nBody text.', fileCbs)

    expect(root.querySelector('h1')!.classList.contains('wb-diff-hidden')).toBe(true)
  })

  it('removing the handle restores hidden blocks and deletes injected nodes', () => {
    const container = buildMuyaDom([
      { tag: 'p', text: 'Keep.' },
      { tag: 'p', text: 'Change me.' }
    ])
    const root = findEditorRoot(container)

    const handle = injectInlineDiff(container, 'Keep.\n\nChange me.', 'Keep.\n\nChanged!', fileCbs)!
    const changed = Array.from(root.querySelectorAll('p')).find(
      (b) => b.textContent === 'Change me.'
    )!
    expect(changed.classList.contains('wb-diff-hidden')).toBe(true)

    handle.remove()

    expect(changed.classList.contains('wb-diff-hidden')).toBe(false)
    expect(root.querySelector('.wb-diff-hunk')).toBeNull()
    expect(root.querySelector('.wb-diff-codelens')).toBeNull()
  })

  it('returns null when there is no change', () => {
    const container = buildMuyaDom([{ tag: 'p', text: 'Same.' }])
    expect(injectInlineDiff(container, 'Same.', 'Same.', fileCbs)).toBeNull()
  })
})
