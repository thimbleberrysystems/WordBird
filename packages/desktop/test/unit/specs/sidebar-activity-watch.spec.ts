/**
 * The DERIVED half of the sidebar dots: Continuity and Snapshots.
 *
 * The store spec covers marking rules. This covers the part that reads real
 * data to decide whether anything NEW arrived and in what key — the half
 * that decides whether a red dot ever appears at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const projectPath = { value: '/w/novel-a' as string | null }
vi.mock('../../../src/renderer/src/store/project', () => ({
  useProjectStore: () => ({ currentProjectPath: projectPath.value })
}))

import {
  refreshDerivedActivity,
  rebaselineView,
  resetActivityBaselines
} from '../../../src/renderer/src/services/sidebarActivityWatch'
import { useSidebarActivityStore } from '../../../src/renderer/src/store/sidebarActivity'

interface Issue {
  id: string
  severity?: string
  status?: string
}

let issues: Issue[] = []
let snapshots: unknown[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  resetActivityBaselines()
  issues = []
  snapshots = []
  projectPath.value = '/w/novel-a'
  ;(globalThis as unknown as { window: unknown }).window = {
    electron: {
      novel: {
        continuityIssues: async() => ({ issues }),
        listSnapshots: async() => ({ snapshots })
      }
    }
  }
})

describe('continuity dots reflect real issues', () => {
  it('a NEW high-severity issue dots continuity red', async() => {
    issues = [{ id: 'a', severity: 'low' }]
    await rebaselineView('continuity') // the writer has looked

    issues = [{ id: 'a', severity: 'low' }, { id: 'b', severity: 'high' }]
    await refreshDerivedActivity(null)

    expect(useSidebarActivityStore().severityOf('continuity')).toBe('error')
  })

  it('a new low-severity issue dots yellow, not red', async() => {
    issues = []
    await rebaselineView('continuity')
    issues = [{ id: 'b', severity: 'low' }]
    await refreshDerivedActivity(null)
    expect(useSidebarActivityStore().severityOf('continuity')).toBe('warn')
  })

  it('pre-existing issues do not dot — only what arrived since', async() => {
    issues = [{ id: 'a', severity: 'high' }]
    await rebaselineView('continuity')
    await refreshDerivedActivity(null)
    expect(useSidebarActivityStore().severityOf('continuity')).toBeNull()
  })

  it('resolved issues are ignored', async() => {
    await rebaselineView('continuity')
    issues = [{ id: 'b', severity: 'high', status: 'resolved' }]
    await refreshDerivedActivity(null)
    expect(useSidebarActivityStore().severityOf('continuity')).toBeNull()
  })

  it('THE FIRST issue of a session still dots', async() => {
    // No rebaselineView first: the writer never opened Continuity, which is
    // the normal case. The first agent turn that logs an issue must still
    // raise the dot — a red dot missed here is the single most valuable one.
    issues = [{ id: 'b', severity: 'high' }]
    await refreshDerivedActivity(null)
    expect(
      useSidebarActivityStore().severityOf('continuity'),
      'the first issue of a session never dotted — the baseline swallowed it'
    ).toBe('error')
  })
})

describe('snapshot dots', () => {
  it('a new snapshot is routine progress (green)', async() => {
    snapshots = [{}]
    await rebaselineView('history')
    snapshots = [{}, {}]
    await refreshDerivedActivity(null)
    expect(useSidebarActivityStore().severityOf('history')).toBe('info')
  })

  it('THE FIRST snapshot of a session still dots', async() => {
    snapshots = [{}]
    await refreshDerivedActivity(null)
    expect(
      useSidebarActivityStore().severityOf('history'),
      'the first snapshot of a session never dotted'
    ).toBe('info')
  })
})

describe('baselines are per project', () => {
  it('another project’s baseline never suppresses this one’s dot', async() => {
    issues = [{ id: 'a', severity: 'high' }]
    await rebaselineView('continuity')

    projectPath.value = '/w/novel-b'
    await refreshDerivedActivity(null)
    // novel-b has never been looked at; its issues are new to this writer.
    expect(useSidebarActivityStore().severityOf('continuity')).toBe('error')
  })
})
