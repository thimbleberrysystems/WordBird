/**
 * Stored-preference migrations: values retired from the app must coerce to
 * a living equivalent when old config files hydrate the store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePreferencesStore } from '../../../src/renderer/src/store/preferences'

vi.mock('../../../src/renderer/src/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))
vi.mock('../../../src/renderer/src/i18n', () => ({
  setLanguage: vi.fn(),
  t: (key: string) => key
}))
vi.mock('../../../src/renderer/src/services/langgraph', () => ({
  langGraphService: {}
}))

describe('preference migrations on hydration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it("the removed 'upload' image action reads as 'folder'", () => {
    const store = usePreferencesStore()
    store.SET_USER_PREFERENCE({ imageInsertAction: 'upload' })
    expect(store.imageInsertAction).toBe('folder')
  })

  it('living image actions pass through untouched', () => {
    const store = usePreferencesStore()
    store.SET_USER_PREFERENCE({ imageInsertAction: 'path' })
    expect(store.imageInsertAction).toBe('path')
  })
})
