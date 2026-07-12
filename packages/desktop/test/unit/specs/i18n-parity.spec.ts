/**
 * Locale key parity: every locale must carry exactly the key set of
 * en.json. Catches the classic drift where a new feature adds English
 * strings and forgets (some of) the other eight locales — from now on that
 * fails CI instead of shipping mixed-language UI.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const localesDir = path.resolve(__dirname, '../../../static/locales')
const LOCALES = ['de', 'es', 'fr', 'ja', 'ko', 'pt', 'zh-CN', 'zh-TW']

type Tree = Record<string, unknown>

const flattenKeys = (tree: Tree, prefix = ''): string[] => {
  const keys: string[] = []
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Tree, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

const load = (name: string): Tree =>
  JSON.parse(fs.readFileSync(path.join(localesDir, `${name}.json`), 'utf8')) as Tree

describe('locale key parity', () => {
  const reference = new Set(flattenKeys(load('en')))

  it('en.json is non-trivial', () => {
    expect(reference.size).toBeGreaterThan(500)
  })

  for (const locale of LOCALES) {
    it(`${locale}.json matches en.json key-for-key`, () => {
      const keys = new Set(flattenKeys(load(locale)))
      const missing = [...reference].filter((k) => !keys.has(k))
      const extra = [...keys].filter((k) => !reference.has(k))
      expect(missing, `missing from ${locale}.json`).toEqual([])
      expect(extra, `extra in ${locale}.json (not in en.json)`).toEqual([])
    })
  }

  it('placeholders survive translation ({tokens} match en.json per key)', () => {
    const placeholderOf = (value: string): string[] =>
      ([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) ?? []).sort()
    const flattenEntries = (tree: Tree, prefix = ''): Array<[string, string]> => {
      const out: Array<[string, string]> = []
      for (const [key, value] of Object.entries(tree)) {
        const full = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          out.push(...flattenEntries(value as Tree, full))
        } else if (typeof value === 'string') {
          out.push([full, value])
        }
      }
      return out
    }
    const en = new Map(flattenEntries(load('en')))
    for (const locale of LOCALES) {
      for (const [key, value] of flattenEntries(load(locale))) {
        const reference = en.get(key)
        if (typeof reference !== 'string') continue
        expect(
          placeholderOf(value),
          `${locale}.json ${key} placeholder mismatch`
        ).toEqual(placeholderOf(reference))
      }
    }
  })
})
