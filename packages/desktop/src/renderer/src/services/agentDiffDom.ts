import { planInlineDiff, type DiffLine } from './agentDiff'

export interface InlineDiffHandle {
  /** Remove the injected nodes and un-hide the original blocks. */
  remove: () => void
}

export interface InlineDiffOptions {
  reason?: string
  onAccept: () => void
  onDiscard: () => void
}

/**
 * Muya nests the real top-level blocks inside an inner `#ag-editor-id` div,
 * which is itself a child of the outer container. Return that inner root.
 */
export function findEditorRoot(container: HTMLElement): HTMLElement {
  return (
    (container.querySelector('#ag-editor-id') as HTMLElement | null) ||
    (container.firstElementChild as HTMLElement | null) ||
    container
  )
}

function makeDiffLineEl(line: DiffLine | null): HTMLDivElement {
  const lineEl = document.createElement('div')
  if (line === null) {
    lineEl.className = 'wb-diff-line wb-diff-line--collapsed'
    lineEl.textContent = '⋯'
    return lineEl
  }
  lineEl.className = `wb-diff-line wb-diff-line--${line.type}`
  const gutterEl = document.createElement('span')
  gutterEl.className = 'wb-diff-line__gutter'
  gutterEl.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '
  const textEl = document.createElement('span')
  textEl.className = 'wb-diff-line__text'
  // Preserve blank lines with a space so the row keeps its height.
  textEl.textContent = line.value.length ? line.value : ' '
  lineEl.appendChild(gutterEl)
  lineEl.appendChild(textEl)
  return lineEl
}

function buildCodeLens(opts: InlineDiffOptions): HTMLDivElement {
  const el = document.createElement('div')
  el.contentEditable = 'false'
  el.className = 'wb-diff-codelens'
  el.dataset.wbDiffInjected = '1'

  if (opts.reason) {
    const labelEl = document.createElement('span')
    labelEl.className = 'wb-diff-codelens__label'
    labelEl.textContent = opts.reason
    el.appendChild(labelEl)
  }

  const actionsEl = document.createElement('div')
  actionsEl.className = 'wb-diff-codelens__actions'

  const acceptBtn = document.createElement('button')
  acceptBtn.className = 'wb-diff-codelens__btn wb-diff-codelens__btn--accept'
  acceptBtn.textContent = '✓ Accept'
  acceptBtn.addEventListener('mousedown', (e) => e.preventDefault())
  acceptBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    opts.onAccept()
  })

  const discardBtn = document.createElement('button')
  discardBtn.className = 'wb-diff-codelens__btn wb-diff-codelens__btn--discard'
  discardBtn.textContent = '✗ Discard'
  discardBtn.addEventListener('mousedown', (e) => e.preventDefault())
  discardBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    opts.onDiscard()
  })

  actionsEl.appendChild(acceptBtn)
  actionsEl.appendChild(discardBtn)
  el.appendChild(actionsEl)
  return el
}

/**
 * Inject a VSCode-style inline diff into Muya's editor DOM: hide the changed
 * blocks and render a line-level unified hunk (red −, green +, muted context)
 * with an Accept/Discard CodeLens bar in their place.
 *
 * Returns a handle to undo the injection, or null if there is nothing to show.
 */
export function injectInlineDiff(
  container: HTMLElement,
  oldContent: string,
  newContent: string,
  opts: InlineDiffOptions
): InlineDiffHandle | null {
  const editorRoot = findEditorRoot(container)

  const topEls = (Array.from(editorRoot.children) as HTMLElement[]).filter(
    (el) => !el.dataset.wbDiffInjected
  )
  const blockTexts = topEls.map((el) => el.textContent || '')

  const plan = planInlineDiff(oldContent, newContent, blockTexts)
  if (plan.hunk.length === 0) return null

  const hiddenEls = plan.hiddenBlockIndices.map((i) => topEls[i]).filter(Boolean)
  const anchor: HTMLElement | null =
    plan.anchorIndex != null && plan.anchorIndex < topEls.length ? topEls[plan.anchorIndex] : null

  for (const el of hiddenEls) el.classList.add('wb-diff-hidden')

  const codeLensEl = buildCodeLens(opts)

  const hunkEl = document.createElement('div')
  hunkEl.contentEditable = 'false'
  hunkEl.className = 'wb-diff-hunk'
  hunkEl.dataset.wbDiffInjected = '1'
  for (const line of plan.hunk) hunkEl.appendChild(makeDiffLineEl(line))

  editorRoot.insertBefore(codeLensEl, anchor)
  editorRoot.insertBefore(hunkEl, anchor)

  return {
    remove() {
      codeLensEl.remove()
      hunkEl.remove()
      for (const el of hiddenEls) el.classList.remove('wb-diff-hidden')
    }
  }
}
