import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeFileDurable, writeFileDurableSync } from 'main_renderer/filesystem/atomic'

/**
 * WordBird keeps more than documents on disk: structure.json IS the binder,
 * and the fact/continuity/decision ledgers, entity index, agent state and
 * agent-written prose sit beside it. A torn write to any of them loses more
 * than one scene, so they all go through the durable (temp + fsync + rename)
 * path rather than a bare writeFile.
 */

const dirs: string[] = []
const tempDir = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-durable-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('writeFileDurable', () => {
  it('writes content and leaves no temp file behind', async() => {
    const dir = tempDir()
    const target = path.join(dir, 'structure.json')

    await writeFileDurable(target, JSON.stringify({ units: [] }))

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ units: [] })
    expect(fs.readdirSync(dir)).toEqual(['structure.json'])
  })

  it('creates the parent directory', async() => {
    // Load-bearing: write-file-atomic itself fails ENOENT into a missing
    // directory, and several callers write into one that may not exist yet.
    const dir = tempDir()
    const target = path.join(dir, '.wordbird', 'continuity', 'facts.json')

    await writeFileDurable(target, '{"facts":[]}')

    expect(fs.readFileSync(target, 'utf8')).toBe('{"facts":[]}')
  })

  it('overwrites an existing file without truncating it first', async() => {
    const dir = tempDir()
    const target = path.join(dir, 'facts.json')
    await writeFileDurable(target, '{"facts":[1,2,3]}')

    await writeFileDurable(target, '{"facts":[4]}')

    expect(fs.readFileSync(target, 'utf8')).toBe('{"facts":[4]}')
  })

  it('writes a Buffer byte-exact (compiled EPUB/DOCX take this path)', async() => {
    const dir = tempDir()
    const target = path.join(dir, 'book.epub')
    // High bytes would be mangled if the payload were coerced through a text
    // encoding — a corrupt export the writer would only notice much later.
    const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80])

    await writeFileDurable(target, payload)

    expect(Buffer.compare(fs.readFileSync(target), payload)).toBe(0)
  })

  it('sync variant behaves the same', () => {
    const dir = tempDir()
    const target = path.join(dir, 'nested', 'session.json')

    writeFileDurableSync(target, '{"permissionMode":"auto"}')

    expect(fs.readFileSync(target, 'utf8')).toBe('{"permissionMode":"auto"}')
    expect(fs.readdirSync(path.dirname(target))).toEqual(['session.json'])
  })
})

describe('critical state writers use the durable path', () => {
  // A source-level guard. The durability property is invisible at runtime —
  // a plain writeFile passes every behavioural test right up until a power
  // cut — so the only way to keep it true as these files evolve is to assert
  // that the raw calls do not come back.
  const CRITICAL = [
    'src/main/services/novel/StructureService.ts',
    'src/main/services/novel/FactService.ts',
    'src/main/services/novel/ContinuityService.ts',
    'src/main/services/novel/Decisions.ts',
    'src/main/services/novel/EntityIndex.ts',
    'src/main/services/novel/ProjectMeta.ts',
    'src/main/services/novel/RevisionService.ts',
    'src/main/services/novel/ManuscriptImporter.ts',
    'src/main/services/ai/NovelToolHandlers.ts',
    'src/main/services/ai/EditResolutionTracker.ts',
    'src/main/services/ai/FileCheckpointSaver.ts',
    'src/main/services/ai/LangGraphManager.ts',
    'src/main/services/ai/agentSdk/AgentSDKRunner.ts'
  ]

  it.each(CRITICAL)('%s writes only through writeFileDurable', (relative) => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../..', relative), 'utf8')
    const raw = source.match(/\b(?:fsPromises|fs\.promises|fs)\.writeFile(?:Sync)?\(/g) ?? []
    expect(raw, `${relative} still writes directly: ${raw.join(', ')}`).toEqual([])
    expect(source).toMatch(/writeFileDurable/)
  })

  it('the web cache is deliberately exempt', () => {
    // Regenerable and written on every fetch — an fsync per entry would be
    // cost without benefit. Documented here so the exemption stays a
    // decision rather than an oversight.
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../..', 'src/main/services/ai/WebToolHandlers.ts'),
      'utf8'
    )
    expect(source).toMatch(/fs\.writeFileSync\(/)
  })
})
