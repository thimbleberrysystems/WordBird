import path from 'path'
import type { BrowserWindowConstructorOptions } from 'electron'

export const isOsx: boolean = process.platform === 'darwin'
export const isWindows: boolean = process.platform === 'win32'
export const isLinux: boolean = process.platform === 'linux'

export const editorWinOptions: Readonly<BrowserWindowConstructorOptions> = Object.freeze({
  minWidth: 550,
  minHeight: 350,
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    // WORKAROUND: We cannot enable spellcheck if it was disabled during
    // renderer startup due to a bug in Electron (Electron#32755). We'll
    // enable it always and set the HTML spelling attribute to false.
    spellcheck: true,
    nodeIntegration: false,
    // SECURITY: the editor renders markdown that references LOCAL images
    // (`file:` URLs). In dev the renderer is served from an http dev server,
    // so those images are cross-origin and require SOP to be relaxed. This is
    // the one window that needs it. RESIDUAL HARDENING (tracked): migrate
    // local-image loading to a custom `protocol.handle` scheme so this can be
    // set to `true` here too, then verify image rendering with real documents.
    // Other windows (preferences, Biscuit) do NOT load local images and keep
    // webSecurity:true below.
    webSecurity: false,
    preload: path.join(__dirname, '../preload/index.js')
  },
  useContentSize: true,
  show: true,
  frame: false,
  titleBarStyle: 'hiddenInset',
  zoomFactor: 1.0
} as BrowserWindowConstructorOptions)

export const preferencesWinOptions: Readonly<BrowserWindowConstructorOptions> = Object.freeze({
  minWidth: 450,
  minHeight: 350,
  width: 950,
  height: 650,
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    // Always true to access native spellchecker.
    spellcheck: true,
    nodeIntegration: false,
    // The preferences UI loads no local `file:` resources, so keep the
    // same-origin policy ON (unlike the editor window).
    webSecurity: true,
    preload: path.join(__dirname, '../preload/index.js')
  },
  fullscreenable: false,
  fullscreen: false,
  minimizable: false,
  useContentSize: true,
  show: true,
  frame: false,
  thickFrame: !isOsx,
  zoomFactor: 1.0
} as BrowserWindowConstructorOptions)

export const PANDOC_EXTENSIONS: readonly string[] = Object.freeze([
  'html',
  'docx',
  'odt',
  'latex',
  'tex',
  'ltx',
  'rst',
  'rest',
  'org',
  'wiki',
  'dokuwiki',
  'textile',
  'opml',
  'epub'
])

export const BLACK_LIST: readonly string[] = Object.freeze(['$RECYCLE.BIN'])

export const EXTENSION_HASN: Readonly<{ styledHtml: string; pdf: string }> = Object.freeze({
  styledHtml: '.html',
  pdf: '.pdf'
})

export const TITLE_BAR_HEIGHT: number = isOsx ? 21 : 32
export const LINE_ENDING_REG = /(?:\r\n|\n)/g
export const LF_LINE_ENDING_REG = /(?:[^\r]\n)|(?:^\n$)/
export const CRLF_LINE_ENDING_REG = /\r\n/

export const GITHUB_REPO_URL = 'https://github.com/Thimbleberrysystems/WordBird'
// copy from muya
export const URL_REG =
  /^http(s)?:\/\/([a-z0-9\-._~]+\.[a-z]{2,}|[0-9.]+|localhost|\[[a-f0-9.:]+\])(:[0-9]{1,5})?(\/[\S]+)?/i
