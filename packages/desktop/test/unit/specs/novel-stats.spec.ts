import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  totalWords,
  updateDailyWordStats
} from '../../../src/main/services/novel/StructureService'
import type { INovelUnit } from '../../../src/shared/types/novel'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-stats-'))
  fs.mkdirSync(path.join(root, '.wordbird'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('totalWords', () => {
  it('sums leaf word counts across nested units', () => {
    const units = [
      {
        id: 'p1',
        type: 'part',
        title: 'Part 1',
        children: [
          { id: 'c1', type: 'chapter', title: 'One', wordCount: 1200 },
          { id: 'c2', type: 'chapter', title: 'Two', wordCount: 800 }
        ]
      },
      { id: 'c3', type: 'chapter', title: 'Loose', wordCount: 500 }
    ] as unknown as INovelUnit[]
    expect(totalWords(units)).toBe(2500)
  })

  it('ignores units without a word count', () => {
    const units = [{ id: 'c1', type: 'chapter', title: 'Empty' }] as unknown as INovelUnit[]
    expect(totalWords(units)).toBe(0)
  })
})

describe('updateDailyWordStats', () => {
  it('records the first total of the day as the baseline and keeps it', async() => {
    const first = await updateDailyWordStats(root, 45000)
    expect(first).toBe(45000)

    // Later the same day the manuscript grew — baseline must not move.
    const second = await updateDailyWordStats(root, 46200)
    expect(second).toBe(45000)

    const stats = JSON.parse(
      fs.readFileSync(path.join(root, '.wordbird', 'stats.json'), 'utf8')
    ) as { days: Record<string, { start: number; last: number }> }
    const [day] = Object.values(stats.days)
    expect(day.start).toBe(45000)
    expect(day.last).toBe(46200)
  })

  it('survives a corrupt stats file by starting fresh', async() => {
    fs.writeFileSync(path.join(root, '.wordbird', 'stats.json'), 'not json', 'utf8')
    const start = await updateDailyWordStats(root, 100)
    expect(start).toBe(100)
  })
})
