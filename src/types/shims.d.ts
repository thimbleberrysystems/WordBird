// Module shims for third-party libraries that ship no type declarations.
// Each entry is `any`-typed; refine as we discover the real shape.

declare module 'dom-autoscroller'
declare module 'flowchart.js'
declare module 'joplin-turndown-plugin-gfm'
declare module 'snapsvg-cjs'
declare module '@hfelix/electron-localshortcut'
declare module 'execall'
declare module 'iso-639-1'
declare module 'fuzzaldrin'
declare module 'ced'
declare module 'font-list'
declare module 'command-exists'
declare module 'pako'
declare module 'snabbdom-to-html'
declare module 'prismjs/themes/*'
declare module 'codemirror/keymap/*'
declare module 'codemirror/mode/*'
declare module 'codemirror/addon/*'
declare module 'electron-window-state'
declare module 'plist'
declare module 'webfontloader'
declare module 'minimatch' {
  export function minimatch(target: string, pattern: string, options?: unknown): boolean
}

// Electron augments `process` with `resourcesPath` (and a few other fields)
// at runtime. Surface them so common/* code can read them without casts.
declare namespace NodeJS {
  interface Process {
    resourcesPath: string
  }
}
