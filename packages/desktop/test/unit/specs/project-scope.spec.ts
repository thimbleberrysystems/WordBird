import { describe, it, expect } from 'vitest'
import {
  isTabInProject,
  partitionTabs
} from '../../../src/renderer/src/util/projectScope'

/**
 * WRITER-REPORTED: after opening a brand-new project, Biscuit summarised the
 * project's state and confidently described four files — from a DIFFERENT
 * project that had since been deleted — as this book's work in progress.
 *
 * The editor keeps unsaved buffers across project switches on purpose (losing
 * a writer's unsaved work is far worse than showing it), but those buffers are
 * not part of whatever project happens to be open, and the vantage sent to the
 * agent had no scope check at all.
 */

const ROOT = '/home/w/novel-a'

describe('isTabInProject', () => {
  it('accepts a file inside the project', () => {
    expect(isTabInProject({ pathname: `${ROOT}/manuscript/ch1/scene.md` }, ROOT)).toBe(true)
  })

  it('rejects a file from another project', () => {
    // The reported case: tabs pointing into a project the writer left.
    expect(isTabInProject({ pathname: '/home/w/novel-b/plans/braided.md' }, ROOT)).toBe(false)
  })

  it('rejects a sibling directory sharing a name prefix', () => {
    // `/home/w/novel-a-old` must not read as inside `/home/w/novel-a`.
    expect(isTabInProject({ pathname: '/home/w/novel-a-old/notes.md' }, ROOT)).toBe(false)
  })

  it('rejects a path that escapes upward', () => {
    expect(isTabInProject({ pathname: `${ROOT}/../novel-b/x.md` }, ROOT)).toBe(false)
  })

  it('keeps untitled buffers — they belong to no project but are live work', () => {
    expect(isTabInProject({ filename: 'Untitled-1' }, ROOT)).toBe(true)
  })

  it('keeps every tab when no project is open', () => {
    // Nothing to be outside of; the scratch window still has a working set.
    expect(isTabInProject({ pathname: '/anywhere/x.md' }, null)).toBe(true)
    expect(isTabInProject({ pathname: '/anywhere/x.md' }, '')).toBe(true)
  })

  it('tolerates a trailing separator on the root', () => {
    expect(isTabInProject({ pathname: `${ROOT}/a.md` }, `${ROOT}/`)).toBe(true)
  })
})

describe('partitionTabs', () => {
  it('splits the writer’s real case: one project tab, three foreign', () => {
    const tabs = [
      { pathname: `${ROOT}/bible/style.md`, filename: 'style.md' },
      { pathname: '/home/w/prj15/plans/braided-novel-elam-to-vanni.md', filename: 'braided.md' },
      { pathname: '/home/w/prj15/bible/lore/the-artefact.md', filename: 'the-artefact.md' },
      { pathname: '/home/w/prj15/bible/places/elam-thread-susa.md', filename: 'susa.md' }
    ]

    const { inProject, foreign } = partitionTabs(tabs, ROOT)

    expect(inProject.map((t) => t.filename)).toEqual(['style.md'])
    expect(foreign).toHaveLength(3)
  })

  it('preserves order and loses nothing', () => {
    const tabs = [
      { pathname: `${ROOT}/a.md` },
      { pathname: '/elsewhere/b.md' },
      { pathname: `${ROOT}/c.md` },
      { filename: 'Untitled-1' }
    ]

    const { inProject, foreign } = partitionTabs(tabs, ROOT)

    expect(inProject).toHaveLength(3)
    expect(foreign).toHaveLength(1)
    expect(inProject.length + foreign.length).toBe(tabs.length)
    expect(inProject[0].pathname).toBe(`${ROOT}/a.md`)
  })
})
