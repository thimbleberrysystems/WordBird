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
