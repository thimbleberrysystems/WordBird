/**
 * Shell IPC guards: renderer-supplied URLs/paths must never become local
 * execution primitives. Pure functions — no Electron needed.
 */

import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { isAllowedExternalUrl, validateOpenPath } from '../../../src/main/ipc/shell'

describe('isAllowedExternalUrl', () => {
  it('allows web and mail URLs', () => {
    expect(isAllowedExternalUrl('https://wordbird.example/docs')).toBe(true)
    expect(isAllowedExternalUrl('http://localhost:3000')).toBe(true)
    expect(isAllowedExternalUrl('mailto:someone@example.com')).toBe(true)
  })

  it('blocks execution-primitive schemes and garbage', () => {
    for (const url of [
      'file:///etc/passwd',
      'smb://attacker/share',
      'javascript:alert(1)',
      'vscode://malicious/handler',
      'ms-msdt:/id PCWDiagnostic',
      'not a url',
      ''
    ]) {
      expect(isAllowedExternalUrl(url), url).toBe(false)
    }
  })
})

describe('validateOpenPath', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-shell-'))
  const file = path.join(dir, 'note.md')
  fs.writeFileSync(file, 'x')

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('accepts a real directory', () => {
    expect(validateOpenPath(dir)).toBeNull()
  })

  it('rejects files (openPath on a file launches it) and missing paths', () => {
    expect(validateOpenPath(file)).toMatch(/directories/i)
    expect(validateOpenPath(path.join(dir, 'nope'))).toMatch(/exist/i)
  })
})
