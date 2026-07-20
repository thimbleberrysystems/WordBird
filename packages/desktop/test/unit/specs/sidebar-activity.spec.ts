/**
 * Sidebar activity markers: "something changed in there since you last
 * looked". The agents icon already pulses while a run is live; this is the
 * steady complement that shows WHERE Biscuit's work landed.
 *
 * The rule that keeps the dots meaningful: never flag the view the writer
 * is currently looking at (it re-renders live), and clear on open.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useSidebarActivityStore,
  PROJECT_CHANGE_VIEWS,
  severityForIssue
} from '../../../src/renderer/src/store/sidebarActivity'

describe('sidebar activity markers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('marks the views a project change invalidates', () => {
    const store = useSidebarActivityStore()
    store.mark(PROJECT_CHANGE_VIEWS, 'info', null)
    for (const view of PROJECT_CHANGE_VIEWS) {
      expect(store.hasUnseen(view), view).toBe(true)
    }
    // Views the change does not touch stay clean — a dot on everything is
    // a dot that means nothing.
    expect(store.hasUnseen('search')).toBe(false)
    expect(store.hasUnseen('toc')).toBe(false)
  })

  it('never marks the view being looked at', () => {
    const store = useSidebarActivityStore()
    store.mark(PROJECT_CHANGE_VIEWS, 'info', 'files')
    expect(store.hasUnseen('files')).toBe(false)
    expect(store.hasUnseen('binder')).toBe(true)
  })

  it('opening a view clears only that view', () => {
    const store = useSidebarActivityStore()
    store.mark(PROJECT_CHANGE_VIEWS, 'info', null)
    store.clear('binder')
    expect(store.hasUnseen('binder')).toBe(false)
    expect(store.hasUnseen('files')).toBe(true)
  })

  it('switching projects clears every marker', () => {
    const store = useSidebarActivityStore()
    store.mark(PROJECT_CHANGE_VIEWS, 'info', null)
    store.clearAll()
    for (const view of PROJECT_CHANGE_VIEWS) {
      expect(store.hasUnseen(view), view).toBe(false)
    }
  })

  it('is reactive — marking replaces the Set rather than mutating it', () => {
    // Vue does not track Set mutation; if mark() mutated in place the dot
    // would only appear on some unrelated re-render.
    const store = useSidebarActivityStore()
    const before = store.unseen
    store.mark(['binder'], 'info', null)
    expect(store.unseen).not.toBe(before)
  })

  it('re-marking an already-marked view does not churn the reference', () => {
    const store = useSidebarActivityStore()
    store.mark(['binder'], 'info', null)
    const marked = store.unseen
    store.mark(['binder'], 'info', null)
    expect(store.unseen).toBe(marked)
  })

  it('clearing an unmarked view is a no-op', () => {
    const store = useSidebarActivityStore()
    const before = store.unseen
    store.clear('binder')
    expect(store.unseen).toBe(before)
  })
})

describe('severity: red needs a decision, yellow a look, green is routine', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('a high-severity continuity issue is an error; anything else is a warning', () => {
    expect(severityForIssue('high')).toBe('error')
    expect(severityForIssue('medium')).toBe('warn')
    expect(severityForIssue('low')).toBe('warn')
    // Unknown/missing severity must not silently become the loudest colour.
    expect(severityForIssue('')).toBe('warn')
  })

  it('a louder severity upgrades an existing mark', () => {
    const store = useSidebarActivityStore()
    store.mark(['continuity'], 'warn', null)
    expect(store.severityOf('continuity')).toBe('warn')
    store.mark(['continuity'], 'error', null)
    expect(store.severityOf('continuity')).toBe('error')
  })

  it('a quieter severity never downgrades a louder one', () => {
    // Routine file churn after a real issue must not turn the dot green
    // and hide that something needs a decision.
    const store = useSidebarActivityStore()
    store.mark(['continuity'], 'error', null)
    store.mark(['continuity'], 'info', null)
    expect(store.severityOf('continuity')).toBe('error')
  })

  it('severityOf is null for a view with nothing new', () => {
    expect(useSidebarActivityStore().severityOf('history')).toBeNull()
  })

  it('marks snapshots and continuity independently of the file-change views', () => {
    const store = useSidebarActivityStore()
    store.mark(['history'], 'info', null)
    store.mark(['continuity'], 'error', null)
    expect(store.severityOf('history')).toBe('info')
    expect(store.severityOf('continuity')).toBe('error')
    expect(store.hasUnseen('files')).toBe(false)
  })
})
