#!/usr/bin/env node
/**
 * Run the Playwright e2e suite under a private X server when one is
 * available.
 *
 * Electron always opens REAL windows — Playwright's `headless: true` does not
 * apply to it — so the suite drives ~190 window open/close cycles against
 * whatever X server $DISPLAY points at. On a desktop session (and especially
 * WSLg) that connection intermittently drops mid-run:
 *
 *   ERROR:ui/base/x/x11_software_bitmap_presenter.cc] XGetWindowAttributes failed
 *   ERROR:ui/gfx/x/connection.cc] X connection error received
 *
 * Once it does, every later launch fails instantly ("Target page, context or
 * browser has been closed") and a green suite turns into ~24 failures that
 * look like application bugs but are not. CI never sees this because it wraps
 * the run in `xvfb-run --auto-servernum`; this script gives local runs the
 * same isolation so local and CI agree.
 *
 * Falls back to a direct run when xvfb-run is missing (macOS, Windows, or a
 * machine without it installed) — the suite still works there, it is just
 * exposed to the session's X server.
 */

import { spawn, spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

// --config is REQUIRED, not decorative. Playwright resolves a config relative
// to the CWD (packages/desktop); this one lives in test/e2e/, so plain
// `playwright test test/e2e` silently ran with DEFAULTS — 24 workers instead
// of `workers: 1`, and no retries. The suite's specs share seeded projects and
// assume one worker, and 24 concurrent Electron apps is also what exhausted
// the X server. Passing it explicitly is what makes the settings real.
const playwright = [
  'playwright',
  'test',
  '--config',
  'test/e2e/playwright.config.ts',
  ...args
]

const hasXvfb =
  process.platform === 'linux' &&
  spawnSync('which', ['xvfb-run'], { stdio: 'ignore' }).status === 0

// CI already wraps the whole command in xvfb-run; wrapping again would nest
// two virtual servers for no benefit.
const wrap = hasXvfb && !process.env.CI

if (process.platform === 'linux' && !hasXvfb && !process.env.CI) {
  console.warn(
    '[e2e] xvfb-run not found — running against $DISPLAY=%s.\n' +
      '[e2e] Electron opens real windows, so a busy or fragile X server can drop\n' +
      '[e2e] the connection mid-run and fail many tests at once. Install it with:\n' +
      '[e2e]   sudo apt-get install -y xvfb\n',
    process.env.DISPLAY ?? '(unset)'
  )
}

const [command, commandArgs] = wrap
  ? ['xvfb-run', ['--auto-servernum', 'pnpm', 'exec', ...playwright]]
  : ['pnpm', ['exec', ...playwright]]

const child = spawn(command, commandArgs, { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
