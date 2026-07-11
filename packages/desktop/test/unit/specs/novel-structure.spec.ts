import { describe, it, expect } from 'vitest'
import {
  countWords,
  slugify,
  findUnit,
  collectLeaves,
  removeUnit,
  moveUnit,
  assembleManuscript
} from '../../../src/main/services/novel/StructureService'
import type { INovelStructure, INovelUnit } from '../../../src/shared/types/novel'

const scene = (id: string, title: string, path: string): INovelUnit => ({
  id,
  type: 'scene',
  title,
  path
})

const buildStructure = (): INovelStructure => ({
  version: 1,
  flavor: 'chapters-scenes',
  units: [
    {
      id: 'part-1',
      type: 'part',
      title: 'Part One',
      children: [
        {
          id: 'ch-1',
          type: 'chapter',
          title: 'The Beginning',
          children: [scene('s-1', 'Opening', 'manuscript/p1/c1/opening.md'), scene('s-2', 'Inciting', 'manuscript/p1/c1/inciting.md')]
        },
        {
          id: 'ch-2',
          type: 'chapter',
          title: 'The Middle',
          children: [scene('s-3', 'Turn', 'manuscript/p1/c2/turn.md')]
        }
      ]
    }
  ]
})

describe('countWords', () => {
  it('counts plain prose words', () => {
    expect(countWords('The quick brown fox jumps.')).toBe(5)
  })

  it('ignores front matter, code, and markdown syntax', () => {
    const md = '---\ntitle: x\npov: someone\n---\n# Heading\n\nSome *emphasized* text and `code` here.\n\n```js\nconst notCounted = true\n```\n'
    // Heading, Some, emphasized, text, and, here = 6 words ("code" stripped)
    expect(countWords(md)).toBe(6)
  })

  it('returns 0 for empty content', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\n  ')).toBe(0)
  })
})

describe('slugify', () => {
  it('lowercases and dashes titles', () => {
    expect(slugify('The Salt-Marsh Letters!')).toBe('the-salt-marsh-letters')
  })

  it('falls back to untitled', () => {
    expect(slugify('!!!')).toBe('untitled')
  })
})

describe('findUnit / collectLeaves / removeUnit', () => {
  it('finds nested units with parent and index', () => {
    const s = buildStructure()
    const found = findUnit(s.units, 's-3')
    expect(found).not.toBeNull()
    expect(found!.unit.title).toBe('Turn')
    expect(found!.parent!.id).toBe('ch-2')
    expect(found!.index).toBe(0)
  })

  it('returns null for unknown ids', () => {
    expect(findUnit(buildStructure().units, 'nope')).toBeNull()
  })

  it('collects leaf units in reading order', () => {
    const leaves = collectLeaves(buildStructure().units)
    expect(leaves.map((l) => l.id)).toEqual(['s-1', 's-2', 's-3'])
  })

  it('removes a unit in place', () => {
    const s = buildStructure()
    const removed = removeUnit(s.units, 's-2')
    expect(removed!.id).toBe('s-2')
    expect(collectLeaves(s.units).map((l) => l.id)).toEqual(['s-1', 's-3'])
  })
})

describe('moveUnit', () => {
  it('moves a scene between chapters at the given index', () => {
    const s = buildStructure()
    expect(moveUnit(s, 's-1', 'ch-2', 1)).toBe(true)
    const ch2 = findUnit(s.units, 'ch-2')!
    expect(ch2.unit.children!.map((c) => c.id)).toEqual(['s-3', 's-1'])
  })

  it('clamps out-of-range indexes', () => {
    const s = buildStructure()
    expect(moveUnit(s, 's-1', 'ch-2', 99)).toBe(true)
    const ch2 = findUnit(s.units, 'ch-2')!
    expect(ch2.unit.children!.map((c) => c.id)).toEqual(['s-3', 's-1'])
  })

  it('moves a unit to the top level with null parent', () => {
    const s = buildStructure()
    expect(moveUnit(s, 'ch-2', null, 0)).toBe(true)
    expect(s.units.map((u) => u.id)).toEqual(['ch-2', 'part-1'])
  })

  it('rejects moving a unit into its own subtree', () => {
    const s = buildStructure()
    expect(moveUnit(s, 'part-1', 'ch-1', 0)).toBe(false)
    expect(moveUnit(s, 'ch-1', 'ch-1', 0)).toBe(false)
  })

  it('rejects unknown units and parents', () => {
    const s = buildStructure()
    expect(moveUnit(s, 'nope', null, 0)).toBe(false)
    expect(moveUnit(s, 's-1', 'nope', 0)).toBe(false)
  })
})

describe('assembleManuscript', () => {
  const contents: Record<string, string> = {
    'manuscript/p1/c1/opening.md': 'It began with rain.',
    'manuscript/p1/c1/inciting.md': 'Then the letter arrived.',
    'manuscript/p1/c2/turn.md': 'Everything changed.'
  }
  const loader = (p: string): string => contents[p] ?? ''

  it('emits part/chapter headings and scene separators in order', () => {
    const out = assembleManuscript(buildStructure(), loader)
    expect(out).toBe(
      '# Part One\n\n' +
        '## The Beginning\n\n' +
        'It began with rain.\n\n* * *\n\nThen the letter arrived.\n\n' +
        '## The Middle\n\n' +
        'Everything changed.\n'
    )
  })

  it('honors custom separators and heading levels', () => {
    const out = assembleManuscript(buildStructure(), loader, {
      separators: { scene: '\n\n---\n\n', partHeadingLevel: 0, chapterHeadingLevel: 1 }
    })
    expect(out).toContain('# The Beginning')
    expect(out).not.toContain('Part One')
    expect(out).toContain('It began with rain.\n\n---\n\nThen the letter arrived.')
  })

  it('includes scene titles as headings when asked', () => {
    const out = assembleManuscript(buildStructure(), loader, { includeSceneTitles: true })
    expect(out).toContain('### Opening\n\nIt began with rain.')
  })

  it('handles flat chapter-file structures', () => {
    const flat: INovelStructure = {
      version: 1,
      flavor: 'flat',
      units: [
        { id: 'c1', type: 'chapter', title: 'One', path: 'one.md' },
        { id: 'c2', type: 'chapter', title: 'Two', path: 'two.md' }
      ]
    }
    const out = assembleManuscript(flat, (p) =>
      p === 'one.md' ? 'First chapter text.' : 'Second chapter text.'
    )
    expect(out).toBe(
      '## One\n\nFirst chapter text.\n\n## Two\n\nSecond chapter text.\n'
    )
  })

  it('skips empty scene files without doubling separators', () => {
    const out = assembleManuscript(buildStructure(), (p) =>
      p === 'manuscript/p1/c1/inciting.md' ? '' : loader(p)
    )
    expect(out).toContain('It began with rain.\n\n## The Middle')
    expect(out).not.toContain('* * *')
  })
})
