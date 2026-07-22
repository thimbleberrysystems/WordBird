import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { searchFilesAndDir, watchers } from 'main_renderer/utils/imagePathAutoComplement'

// Image-path auto-complete watches the directory it just listed. `fs.watch`
// throws SYNCHRONOUSLY for directories the OS cannot watch — notably UNC /
// \\wsl.localhost network paths on Windows (EISDIR) — and that escaped as an
// uncaught exception, killing the main process with an "Unexpected error"
// dialog. It must degrade to "not watching" instead.
//
// Ported from upstream marktext 642a0ea5.

const tmpDirs: string[] = []

const seedDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-imgpath-'))
  fs.writeFileSync(path.join(dir, 'a.png'), '')
  fs.writeFileSync(path.join(dir, 'notes.md'), '')
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    watchers.get(dir)?.close()
    watchers.delete(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('searchFilesAndDir', () => {
  it('lists images in a watchable directory and tracks it', async() => {
    const dir = seedDir()

    const result = await searchFilesAndDir(dir, '')

    expect(result.some((e) => e.file === 'a.png')).toBe(true)
    expect(watchers.has(dir)).toBe(true)
  })

  it('rejects for a directory that does not exist', async() => {
    const missing = path.join(os.tmpdir(), 'wb-imgpath-does-not-exist-xyz')

    await expect(searchFilesAndDir(missing, '')).rejects.toBeTruthy()
  })

  it('still resolves when the directory cannot be watched (UNC/WSL paths)', async() => {
    const dir = seedDir()

    // fs.watch throws synchronously for unwatchable dirs (e.g. \\wsl.localhost
    // UNC paths on Windows -> EISDIR). This used to escape as an uncaught
    // exception -> "Unexpected error in the main process" dialog.
    const spy = vi.spyOn(fs, 'watch').mockImplementation(() => {
      throw Object.assign(new Error('EISDIR: illegal operation on a directory, watch'), {
        code: 'EISDIR'
      })
    })

    const result = await searchFilesAndDir(dir, '')

    expect(result.some((e) => e.file === 'a.png')).toBe(true)
    // The unwatchable directory is simply not tracked.
    expect(watchers.has(dir)).toBe(false)

    spy.mockRestore()
  })
})
