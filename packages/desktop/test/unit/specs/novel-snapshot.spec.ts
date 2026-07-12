import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SnapshotService } from '../../../src/main/services/novel/SnapshotService'

let root: string
const service = new SnapshotService()

const write = (relative: string, content: string): void => {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, 'utf8')
}

const read = (relative: string): string => fs.readFileSync(path.join(root, relative), 'utf8')

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-snap-'))
  write('.wordbird/project.json', JSON.stringify({ name: 'Test', flavor: 'flat' }))
  write('chapter-one.md', 'The first draft.')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('SnapshotService', () => {
  it('takes a snapshot and lists it newest-first', async() => {
    const id = await service.snapshot(root, 'First words')
    expect(id).toBeTruthy()

    write('chapter-one.md', 'The second draft.')
    const id2 = await service.snapshot(root, 'Second words')
    expect(id2).toBeTruthy()

    const snapshots = await service.list(root)
    expect(snapshots.map((s) => s.message)).toEqual(['Second words', 'First words'])
    expect(snapshots[0].id).toBe(id2)
    expect(snapshots[0].timestamp).toBeGreaterThan(0)
    expect(snapshots[0].auto).toBe(false)
  })

  it('returns null when nothing changed', async() => {
    await service.snapshot(root, 'Baseline')
    const id = await service.snapshot(root, 'No changes')
    expect(id).toBeNull()
  })

  it('marks auto snapshots and strips the prefix in listings', async() => {
    await service.snapshot(root, 'Before agent task', true)
    const snapshots = await service.list(root)
    expect(snapshots[0].auto).toBe(true)
    expect(snapshots[0].message).toBe('Before agent task')
  })

  it('lists nothing for an empty repository', async() => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-snap-empty-'))
    try {
      expect(await service.list(emptyRoot)).toEqual([])
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true })
    }
  })

  it('restores file contents from an earlier snapshot as a new snapshot', async() => {
    const first = await service.snapshot(root, 'Original')
    write('chapter-one.md', 'Ruined by rewrites.')
    await service.snapshot(root, 'Bad rewrite')

    const restoredId = await service.restore(root, first as string)
    expect(restoredId).toBeTruthy()
    expect(read('chapter-one.md')).toBe('The first draft.')

    // History is linear: nothing was lost, the rewind is a new snapshot.
    const snapshots = await service.list(root)
    expect(snapshots[0].message).toContain('Rewound to "Original"')
    expect(snapshots.map((s) => s.message)).toContain('Bad rewrite')
  })

  it('removes files created after the target snapshot on restore', async() => {
    const first = await service.snapshot(root, 'Original')
    write('chapter-two.md', 'A chapter that will be unwritten.')
    await service.snapshot(root, 'Added chapter two')

    await service.restore(root, first as string)
    expect(fs.existsSync(path.join(root, 'chapter-two.md'))).toBe(false)
  })

  it('preserves uncommitted work in an auto snapshot before rewinding', async() => {
    const first = await service.snapshot(root, 'Original')
    write('chapter-one.md', 'Unsaved experiments.')

    await service.restore(root, first as string)
    const snapshots = await service.list(root)
    const guard = snapshots.find((s) => s.message === 'Before rewind')
    expect(guard).toBeDefined()
    expect(guard?.auto).toBe(true)
    expect(read('chapter-one.md')).toBe('The first draft.')
  })

  it('rejects restoring an unknown snapshot id', async() => {
    await service.snapshot(root, 'Original')
    await expect(service.restore(root, 'deadbeef'.repeat(5))).rejects.toThrow(
      /Snapshot not found/
    )
  })
})

describe('history coalescing', () => {
  it('squashes snapshots beyond the limit into a baseline and keeps content intact', async() => {
    // 8 snapshots, each changing the file.
    for (let i = 1; i <= 8; i++) {
      // Unique length per revision — same-length rapid writes can defeat
      // git's stat cache and record nothing.
      write('chapter-one.md', `Draft version ${i}. ${'#'.repeat(i)}`)
      await service.snapshot(root, `Rev ${i}`)
    }
    const before = await service.list(root)
    expect(before).toHaveLength(8)

    const result = await service.coalesce(root, 3)
    expect(result?.squashed).toBe(5)

    const after = await service.list(root)
    // Newest 3 kept + 1 baseline commit.
    expect(after).toHaveLength(4)
    expect(after[0].message).toBe('Rev 8')
    expect(after[1].message).toBe('Rev 7')
    expect(after[2].message).toBe('Rev 6')
    expect(after[3].message).toMatch(/Coalesced 5 earlier snapshots/)
    expect(after[3].auto).toBe(true)

    // Restoring a kept snapshot still yields the right content.
    await service.restore(root, after[2].id)
    expect(read('chapter-one.md')).toBe(`Draft version 6. ${'#'.repeat(6)}`)

    // The baseline preserves the newest squashed snapshot's content (Rev 5).
    await service.restore(root, (await service.list(root)).find((s) =>
      s.message.includes('Coalesced')
    )!.id)
    expect(read('chapter-one.md')).toBe(`Draft version 5. ${'#'.repeat(5)}`)
  })

  it('is a no-op when under the limit or when limit is unlimited (0)', async() => {
    write('chapter-one.md', 'One.')
    await service.snapshot(root, 'Only')
    expect(await service.coalesce(root, 5)).toBeNull()
    expect(await service.coalesce(root, 0)).toBeNull()
    expect(await service.list(root)).toHaveLength(1)
  })

  it('prunes unreachable objects so coalescing reclaims space', async() => {
    for (let i = 1; i <= 6; i++) {
      write('chapter-one.md', `Padding content ${'x'.repeat(500 + i)} v${i}`)
      await service.snapshot(root, `Rev ${i}`)
    }
    const objectsDir = path.join(root, '.git', 'objects')
    const countObjects = (): number => {
      let total = 0
      for (const shard of fs.readdirSync(objectsDir)) {
        if (shard.length !== 2) continue
        total += fs.readdirSync(path.join(objectsDir, shard)).length
      }
      return total
    }
    const beforeCount = countObjects()
    await service.coalesce(root, 2)
    expect(countObjects()).toBeLessThan(beforeCount)

    // History still fully functional after pruning.
    const snapshots = await service.list(root)
    expect(snapshots[0].message).toBe('Rev 6')
    await service.restore(root, snapshots[1].id)
    expect(read('chapter-one.md')).toContain('v5')
  })

  it('auto-coalesces once snapshots exceed limit plus slack', async() => {
    service.setHistoryLimit(3)
    try {
      // 3 + 50 slack + 1 = 54 snapshots trips the automatic pass.
      for (let i = 1; i <= 54; i++) {
        write('chapter-one.md', `v${i} ${'#'.repeat(i)}`)
        await service.snapshot(root, `Rev ${i}`)
      }
      const after = await service.list(root)
      expect(after.length).toBe(4) // newest 3 + baseline
      expect(after[0].message).toBe('Rev 54')
    } finally {
      service.setHistoryLimit(1000)
    }
  })
})
