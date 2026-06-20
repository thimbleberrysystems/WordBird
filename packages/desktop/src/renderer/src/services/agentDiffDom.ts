import { planInlineDiff, type DiffLine } from './agentDiff'
import { buildHunks, computeDiffSegments, type DiffHunk } from './agentDiffHunks'

export interface InlineDiffHandle {
  /** Remove the injected nodes and un-hide the original blocks. */
  remove: () => void
}

export interface InlineDiffOptions {
  reason?: string
  /** Accept every hunk in this file. */
  onAcceptFile: () => void
  /** Discard every hunk in this file. */
  onDiscardFile: () => void
  /** Accept a single hunk (0-based index among the file's hunks). */
  onAcceptHunk?: (hunkIndex: number) => void
  /** Discard a single hunk. */
  onDiscardHunk?: (hunkIndex: number) => void
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

function makeButton(label: string, variant: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = `wb-diff-btn wb-diff-btn--${variant}`
  btn.textContent = label
  // preventDefault on mousedown so clicking does not steal editor focus/selection
  btn.addEventListener('mousedown', (e) => e.preventDefault())
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return btn
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
  textEl.textContent = line.value.length ? line.value : ' '
  lineEl.appendChild(gutterEl)
  lineEl.appendChild(textEl)
  return lineEl
}

/** File-level CodeLens header: change count + Accept All / Discard All. */
function buildFileCodeLens(opts: InlineDiffOptions, hunkCount: number): HTMLDivElement {
  const el = document.createElement('div')
  el.contentEditable = 'false'
  el.className = 'wb-diff-codelens'
  el.dataset.wbDiffInjected = '1'

  const labelEl = document.createElement('span')
  labelEl.className = 'wb-diff-codelens__label'
  const changeWord = hunkCount === 1 ? 'change' : 'changes'
  labelEl.textContent = opts.reason ? `${opts.reason} · ${hunkCount} ${changeWord}` : `${hunkCount} ${changeWord}`
  el.appendChild(labelEl)

  const actionsEl = document.createElement('div')
  actionsEl.className = 'wb-diff-codelens__actions'
  actionsEl.appendChild(makeButton('✓ Accept All', 'accept', opts.onAcceptFile))
  actionsEl.appendChild(makeButton('✗ Discard All', 'discard', opts.onDiscardFile))
  el.appendChild(actionsEl)
  return el
}

/** One hunk: a mini Accept/Discard header followed by the hunk's diff lines. */
function buildHunkEl(hunk: DiffHunk, opts: InlineDiffOptions): HTMLDivElement {
  const el = document.createElement('div')
  el.contentEditable = 'false'
  el.className = 'wb-diff-hunk'
  el.dataset.wbDiffInjected = '1'
  el.dataset.hunkIndex = String(hunk.hunkIndex)

  if (opts.onAcceptHunk || opts.onDiscardHunk) {
    const header = document.createElement('div')
    header.className = 'wb-diff-hunk__header'

    const tag = document.createElement('span')
    tag.className = 'wb-diff-hunk__tag'
    tag.textContent = `Change ${hunk.hunkIndex + 1}`
    header.appendChild(tag)

    const actions = document.createElement('div')
    actions.className = 'wb-diff-hunk__actions'
    if (opts.onAcceptHunk) {
      actions.appendChild(makeButton('✓ Accept', 'accept', () => opts.onAcceptHunk!(hunk.hunkIndex)))
    }
    if (opts.onDiscardHunk) {
      actions.appendChild(
        makeButton('✗ Discard', 'discard', () => opts.onDiscardHunk!(hunk.hunkIndex))
      )
    }
    header.appendChild(actions)
    el.appendChild(header)
  }

  const linesEl = document.createElement('div')
  linesEl.className = 'wb-diff-hunk__lines'
  for (const line of hunk.lines) linesEl.appendChild(makeDiffLineEl(line))
  el.appendChild(linesEl)

  return el
}

/**
 * Inject a VSCode-style inline diff into Muya's editor DOM: hide the changed
 * blocks and render, in their place, a file-level Accept All / Discard All
 * header followed by one block per hunk — each with its own Accept / Discard.
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

  const hunks = buildHunks(computeDiffSegments(oldContent, newContent))
  if (hunks.length === 0) return null

  // Reuse the verified planner for which blocks to hide and where to anchor.
  const plan = planInlineDiff(oldContent, newContent, blockTexts)
  const hiddenEls = plan.hiddenBlockIndices.map((i) => topEls[i]).filter(Boolean)
  const anchor: HTMLElement | null =
    plan.anchorIndex != null && plan.anchorIndex < topEls.length ? topEls[plan.anchorIndex] : null

  for (const el of hiddenEls) el.classList.add('wb-diff-hidden')

  const injected: HTMLElement[] = []

  const codeLensEl = buildFileCodeLens(opts, hunks.length)
  editorRoot.insertBefore(codeLensEl, anchor)
  injected.push(codeLensEl)

  for (const hunk of hunks) {
    const hunkEl = buildHunkEl(hunk, opts)
    editorRoot.insertBefore(hunkEl, anchor)
    injected.push(hunkEl)
  }

  return {
    remove() {
      for (const el of injected) el.remove()
      for (const el of hiddenEls) el.classList.remove('wb-diff-hidden')
    }
  }
}
