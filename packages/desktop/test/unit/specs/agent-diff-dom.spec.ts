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

describe('findEditorRoot', () => {
  it('returns the inner #ag-editor-id div, not the outer container', () => {
    const container = buildMuyaDom([{ tag: 'p', text: 'hi' }])
    const root = findEditorRoot(container)
    expect(root.id).toBe('ag-editor-id')
  })
})

describe('injectInlineDiff', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  const noop = { onAccept: () => {}, onDiscard: () => {} }

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
      noop
    )

    expect(handle).not.toBeNull()

    // The original "Second paragraph." block is hidden
    const blocks = Array.from(root.querySelectorAll('p'))
    const second = blocks.find((b) => b.textContent === 'Second paragraph.')!
    expect(second.classList.contains('wb-diff-hidden')).toBe(true)

    // First and Third remain visible
    const first = blocks.find((b) => b.textContent === 'First paragraph.')!
    const third = blocks.find((b) => b.textContent === 'Third paragraph.')!
    expect(first.classList.contains('wb-diff-hidden')).toBe(false)
    expect(third.classList.contains('wb-diff-hidden')).toBe(false)

    // A CodeLens bar with Accept/Discard exists
    expect(root.querySelector('.wb-diff-codelens')).not.toBeNull()
    expect(root.querySelector('.wb-diff-codelens__btn--accept')!.textContent).toContain('Accept')
    expect(root.querySelector('.wb-diff-codelens__btn--discard')!.textContent).toContain('Discard')

    // The hunk renders BOTH the removed and the added line
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

    injectInlineDiff(container, 'Alpha.\n\nBeta.', 'Alpha.\n\nBeta CHANGED.', noop)

    // Injected nodes live inside #ag-editor-id, not as stray children of container
    expect(root.querySelector('.wb-diff-hunk')).not.toBeNull()
    const strayInContainer = Array.from(container.children).filter(
      (c) => (c as HTMLElement).dataset?.wbDiffInjected === '1'
    )
    expect(strayInContainer.length).toBe(0)
  })

  it('matches a heading block despite the markdown # prefix', () => {
    const container = buildMuyaDom([
      { tag: 'h1', text: 'Old Title' }, // Muya renders heading without the #
      { tag: 'p', text: 'Body text.' }
    ])
    const root = findEditorRoot(container)

    injectInlineDiff(container, '# Old Title\n\nBody text.', '# New Title\n\nBody text.', noop)

    const heading = root.querySelector('h1')!
    expect(heading.classList.contains('wb-diff-hidden')).toBe(true)
  })

  it('removing the handle restores hidden blocks and deletes injected nodes', () => {
    const container = buildMuyaDom([
      { tag: 'p', text: 'Keep.' },
      { tag: 'p', text: 'Change me.' }
    ])
    const root = findEditorRoot(container)

    const handle = injectInlineDiff(container, 'Keep.\n\nChange me.', 'Keep.\n\nChanged!', noop)!

    const changed = Array.from(root.querySelectorAll('p')).find(
      (b) => b.textContent === 'Change me.'
    )!
    expect(changed.classList.contains('wb-diff-hidden')).toBe(true)

    handle.remove()

    expect(changed.classList.contains('wb-diff-hidden')).toBe(false)
    expect(root.querySelector('.wb-diff-hunk')).toBeNull()
    expect(root.querySelector('.wb-diff-codelens')).toBeNull()
  })

  it('wires Accept and Discard buttons to callbacks', () => {
    const container = buildMuyaDom([{ tag: 'p', text: 'Old.' }])
    const onAccept = vi.fn()
    const onDiscard = vi.fn()

    const root = findEditorRoot(container)
    injectInlineDiff(container, 'Old.', 'New.', { onAccept, onDiscard })
    ;(root.querySelector('.wb-diff-codelens__btn--accept') as HTMLButtonElement).click()
    expect(onAccept).toHaveBeenCalledOnce()
    ;(root.querySelector('.wb-diff-codelens__btn--discard') as HTMLButtonElement).click()
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('returns null when there is no change', () => {
    const container = buildMuyaDom([{ tag: 'p', text: 'Same.' }])
    const handle = injectInlineDiff(container, 'Same.', 'Same.', noop)
    expect(handle).toBeNull()
  })
})
