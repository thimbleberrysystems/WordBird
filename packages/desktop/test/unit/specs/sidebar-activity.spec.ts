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
  PROJECT_CHANGE_VIEWS
} from '../../../src/renderer/src/store/sidebarActivity'

describe('sidebar activity markers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('marks the views a project change invalidates', () => {
    const store = useSidebarActivityStore()
    store.mark(PROJECT_CHANGE_VIEWS, null)
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
    store.mark(PROJECT_CHANGE_VIEWS, 'files')
    expect(store.hasUnseen('files')).toBe(false)
    expect(store.hasUnseen('binder')).toBe(true)
  })

  it('opening a view clears only that view', () => {
    const store = useSidebarActivityStore()
    store.mark(PROJECT_CHANGE_VIEWS, null)
    store.clear('binder')
    expect(store.hasUnseen('binder')).toBe(false)
    expect(store.hasUnseen('files')).toBe(true)
  })

  it('switching projects clears every marker', () => {
    const store = useSidebarActivityStore()
    store.mark(PROJECT_CHANGE_VIEWS, null)
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
    store.mark(['binder'], null)
    expect(store.unseen).not.toBe(before)
  })

  it('re-marking an already-marked view does not churn the reference', () => {
    const store = useSidebarActivityStore()
    store.mark(['binder'], null)
    const marked = store.unseen
    store.mark(['binder'], null)
    expect(store.unseen).toBe(marked)
  })

  it('clearing an unmarked view is a no-op', () => {
    const store = useSidebarActivityStore()
    const before = store.unseen
    store.clear('binder')
    expect(store.unseen).toBe(before)
  })
})
