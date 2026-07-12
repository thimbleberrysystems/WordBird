// Sandboxed preload: only `electron` can be required, and only a tiny subset of
// `process` is available (platform, versions, env). Everything else lives in
// the main process and is reached via IPC.
//
// All IPC traffic is funneled through the typed generics in
// `@shared/types/ipc` so channel names, argument tuples and return shapes
// are checked at the call site.

import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import pathe from 'pathe'

import type {
  IpcInvokeChannels,
  IpcSendChannels,
  IpcSyncChannels,
  IpcMainEventChannels,
  BootInfo,
  ProjectCreateArgs,
  ProjectLoadArgs
} from '@shared/types/ipc'

import type {
  AIProvider,
  IAIConfig,
  ILangGraphMessage,
  IAgentToolCall,
  IAgentApplyEditRequest,
  IAgentEditProposal,
  IAgentActivityEvent,
  IAgentApprovalRequest,
  IContextUsage,
  IPlanProposal,
  ITokenUsageUpdate,
  IAgentStatus,
  AgentPermissionMode
} from '@shared/types/langgraph'

import type {
  INovelCreateUnitPayload,
  INovelUnitUpdate,
  INovelCompileOptions,
  ProjectFlavor
} from '@shared/types/novel'

type RendererEventListener<K extends keyof IpcMainEventChannels> = (
  event: IpcRendererEvent,
  ...args: IpcMainEventChannels[K]
) => void

const invoke = <K extends keyof IpcInvokeChannels>(
  channel: K,
  ...args: IpcInvokeChannels[K]['args']
): Promise<IpcInvokeChannels[K]['ret']> => ipcRenderer.invoke(channel, ...args)

const send = <K extends keyof IpcSendChannels>(channel: K, ...args: IpcSendChannels[K]): void =>
  ipcRenderer.send(channel, ...args)

// One synchronous handshake at startup so the renderer can read platform/env
// without an `await` from inside Vue computed properties etc.
const bootInfo = ipcRenderer.sendSync('mt::boot-info') as BootInfo | undefined

const ipcWrapper = {
  send,
  sendSync: <K extends keyof IpcSyncChannels>(
    channel: K,
    ...args: IpcSyncChannels[K]['args']
  ): IpcSyncChannels[K]['ret'] => ipcRenderer.sendSync(channel, ...args),
  invoke,
  on: <K extends keyof IpcMainEventChannels>(
    channel: K,
    listener: RendererEventListener<K>
  ): (() => void) => {
    const subscription = (event: IpcRendererEvent, ...args: unknown[]): void => {
      listener(event, ...(args as IpcMainEventChannels[K]))
    }
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  once: <K extends keyof IpcMainEventChannels>(
    channel: K,
    listener: RendererEventListener<K>
  ): (() => void) => {
    const subscription = (event: IpcRendererEvent, ...args: unknown[]): void => {
      listener(event, ...(args as IpcMainEventChannels[K]))
    }
    ipcRenderer.once(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  removeAllListeners: (channel: keyof IpcMainEventChannels | string): void => {
    ipcRenderer.removeAllListeners(channel as string)
  }
}

const shellAPI = {
  openExternal: (url: string) => invoke('mt::shell::open-external', url),
  showItemInFolder: (fullPath: string) => send('mt::shell::show-item', fullPath),
  openPath: (fullPath: string) => invoke('mt::shell::open-path', fullPath)
}

const clipboardAPI = {
  writeText: (text: string) => send('mt::clipboard::write-text', text),
  readText: () => invoke('mt::clipboard::read-text'),
  guessFilePath: () => invoke('mt::clipboard::guess-file-path')
}

const webFrameAPI = {
  setZoomFactor: (factor: number): void => {
    if (typeof factor === 'number' && factor > 0) webFrame.setZoomFactor(factor)
  },
  setZoomLevel: (level: number): void => {
    if (typeof level === 'number') webFrame.setZoomLevel(level)
  }
}

const webUtilsAPI = {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

const windowControlAPI = {
  minimize: () => send('mt::win::minimize'),
  maximize: () => send('mt::win::maximize'),
  unmaximize: () => send('mt::win::unmaximize'),
  toggleMaximize: () => send('mt::win::toggle-maximize'),
  close: () => send('mt::win::close'),
  setFullScreen: (flag: boolean) => send('mt::win::set-fullscreen', flag),
  toggleFullScreen: () => send('mt::win::toggle-fullscreen'),
  isMaximized: () => invoke('mt::win::is-maximized'),
  isFullScreen: () => invoke('mt::win::is-fullscreen'),
  popupMenu: (template: unknown, position?: { x: number; y: number }) =>
    send('mt::menu::popup', template as never, position),
  popupApplicationMenu: (position?: { x: number; y: number }) =>
    send('mt::menu::popup-application', position)
}

// These three predicates are pure path-string operations: implementing them
// in the preload keeps them synchronous so existing call sites like
// `tabs.find(t => isSamePathSync(t.pathname, ...))` keep returning the right
// item instead of a truthy Promise.
const MARKDOWN_EXTENSIONS = [
  'markdown',
  'mdown',
  'mkdn',
  'md',
  'mkd',
  'mdwn',
  'mdtxt',
  'mdtext',
  'mdx',
  'text',
  'txt'
] as const

const hasMarkdownExtension = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false
  return MARKDOWN_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(`.${ext}`))
}

const isChildOfDirectory = (dir: string, child: string): boolean => {
  if (!dir || !child) return false
  const relative = pathe.relative(dir, child)
  return !!relative && !relative.startsWith('..') && !pathe.isAbsolute(relative)
}

const isSamePathSync = (pathA: string, pathB: string, isNormalized: boolean = false): boolean => {
  if (!pathA || !pathB) return false
  const a = isNormalized ? pathA : pathe.normalize(pathA)
  const b = isNormalized ? pathB : pathe.normalize(pathB)
  if (a.length !== b.length) return false
  if (a === b) return true
  if (a.toLowerCase() === b.toLowerCase()) {
    // Case-insensitive filesystem fallback — block briefly on a sync IPC
    // because callers (tab matching) need a boolean answer right now.
    try {
      return ipcRenderer.sendSync('mt::paths::is-same-sync', a, b)
    } catch {
      return false
    }
  }
  return false
}

const fileUtilsAPI = {
  isFile: (p: string) => invoke('mt::fs::is-file', p),
  isDirectory: (p: string) => invoke('mt::fs::is-directory', p),
  emptyDir: (p: string) => invoke('mt::fs::empty-dir', p),
  copy: (src: string, dest: string) => invoke('mt::fs::copy', src, dest),
  ensureDir: (p: string) => invoke('mt::fs::ensure-dir', p),
  outputFile: (p: string, data: string | Uint8Array) => invoke('mt::fs::output-file', p, data),
  move: (src: string, dest: string) => invoke('mt::fs::move', src, dest),
  stat: (p: string) => invoke('mt::fs::stat', p),
  writeFile: (p: string, data: string | Uint8Array) => invoke('mt::fs::write-file', p, data),
  readFile: (p: string, encoding?: string) => invoke('mt::fs::read-file', p, encoding),
  pathExists: (p: string) => invoke('mt::fs::path-exists', p),
  unlink: (p: string) => invoke('mt::fs::unlink', p),
  readdir: (p: string) => invoke('mt::fs::readdir', p),
  isExecutable: (p: string) => invoke('mt::fs::is-executable', p),
  // Pure-string predicates — synchronous, no IPC for the common case.
  isChildOfDirectory,
  hasMarkdownExtension,
  isSamePathSync,
  // isImageFile needs an fs.statSync; keep it async via IPC.
  isImageFile: (p: string) => invoke('mt::paths::is-image', p),
  MARKDOWN_INCLUSIONS: bootInfo?.MARKDOWN_INCLUSIONS || []
}

const commandAPI = {
  exists: (name: string) => invoke('mt::cmd::exists', name)
}

const i18nAPI = {
  loadTranslations: (language: string) => invoke('mt::i18n::load', language)
}

type RipgrepHandler = (payload: unknown) => void
const ripgrepAPI = {
  start: (req: unknown) => invoke('mt::rg::start', req),
  cancel: (searchId: string) => send('mt::rg::cancel', searchId),
  onMatch: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('mt::rg::match', sub)
    return () => ipcRenderer.removeListener('mt::rg::match', sub)
  },
  onProgress: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('mt::rg::progress', sub)
    return () => ipcRenderer.removeListener('mt::rg::progress', sub)
  },
  onDone: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('mt::rg::done', sub)
    return () => ipcRenderer.removeListener('mt::rg::done', sub)
  },
  onError: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('mt::rg::error', sub)
    return () => ipcRenderer.removeListener('mt::rg::error', sub)
  },
  onCancelled: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('mt::rg::cancelled', sub)
    return () => ipcRenderer.removeListener('mt::rg::cancelled', sub)
  }
}

const uploaderAPI = {
  uploadImage: (req: unknown) => invoke('mt::uploader::upload', req)
}

const projectAPI = {
  create: (args: ProjectCreateArgs = {}) => invoke('mt::project:create', args),
  load: (args: ProjectLoadArgs = {}) => invoke('mt::project:load', args),
  validate: (path: string) => invoke('mt::project:validate', path),
  saveAs: (currentPath: string) => invoke('mt::project:save-as', currentPath)
}

const novelAPI = {
  getStructure: (root: string) => invoke('mt::novel:get-structure', root),
  initStructure: (root: string, flavor: ProjectFlavor) =>
    invoke('mt::novel:init-structure', root, flavor),
  createUnit: (root: string, payload: INovelCreateUnitPayload) =>
    invoke('mt::novel:create-unit', root, payload),
  updateUnit: (root: string, unitId: string, update: INovelUnitUpdate) =>
    invoke('mt::novel:update-unit', root, unitId, update),
  moveUnit: (root: string, unitId: string, newParentId: string | null, index: number) =>
    invoke('mt::novel:move-unit', root, unitId, newParentId, index),
  deleteUnit: (root: string, unitId: string, deleteFiles: boolean) =>
    invoke('mt::novel:delete-unit', root, unitId, deleteFiles),
  compile: (root: string, options?: INovelCompileOptions) =>
    invoke('mt::novel:compile', root, options),
  snapshot: (root: string, message: string) => invoke('mt::novel:snapshot', root, message),
  listSnapshots: (root: string, limit?: number) => invoke('mt::novel:snapshots', root, limit),
  restoreSnapshot: (root: string, snapshotId: string) =>
    invoke('mt::novel:restore-snapshot', root, snapshotId),
  continuityIssues: (root: string) => invoke('mt::novel:continuity-issues', root),
  listRevisions: (root: string) => invoke('mt::novel:list-revisions', root),
  resolveIssue: (root: string, issueId: string) =>
    invoke('mt::novel:resolve-issue', root, issueId)
}

const aiAPI = {
  connect: (config: IAIConfig) => invoke('mt::ai:connect', config),
  disconnect: () => invoke('mt::ai:disconnect'),
  sendMessage: (messages: ILangGraphMessage[]) => invoke('mt::ai:send-message', messages),
  abort: () => invoke('mt::ai:abort'),
  resetThread: () => invoke('mt::ai:reset-thread'),
  setMode: (mode: AgentPermissionMode) => invoke('mt::ai:set-mode', mode),
  getMode: () => invoke('mt::ai:get-mode'),
  approve: (approvalId: string, approved: boolean) =>
    invoke('mt::ai:approve', approvalId, approved),
  onActivity: (handler: (event: IAgentActivityEvent) => void) => {
    const subscription = (_e: unknown, event: IAgentActivityEvent) => handler(event)
    ipcRenderer.on('mt::ai:activity', subscription)
    return () => ipcRenderer.removeListener('mt::ai:activity', subscription)
  },
  onApprovalRequest: (handler: (request: IAgentApprovalRequest) => void) => {
    const subscription = (_e: unknown, request: IAgentApprovalRequest) => handler(request)
    ipcRenderer.on('mt::ai:approval-request', subscription)
    return () => ipcRenderer.removeListener('mt::ai:approval-request', subscription)
  },
  onContextUsage: (handler: (usage: IContextUsage) => void) => {
    const subscription = (_e: unknown, usage: IContextUsage) => handler(usage)
    ipcRenderer.on('mt::ai:context-usage', subscription)
    return () => ipcRenderer.removeListener('mt::ai:context-usage', subscription)
  },
  onPlanSaved: (handler: (event: { path: string }) => void) => {
    const subscription = (_e: unknown, event: { path: string }) => handler(event)
    ipcRenderer.on('mt::ai:plan-saved', subscription)
    return () => ipcRenderer.removeListener('mt::ai:plan-saved', subscription)
  },
  onPlanProposal: (handler: (plan: IPlanProposal) => void) => {
    const subscription = (_e: unknown, plan: IPlanProposal) => handler(plan)
    ipcRenderer.on('mt::ai:plan-proposal', subscription)
    return () => ipcRenderer.removeListener('mt::ai:plan-proposal', subscription)
  },
  onTokenUsage: (handler: (usage: ITokenUsageUpdate) => void) => {
    const subscription = (_e: unknown, usage: ITokenUsageUpdate) => handler(usage)
    ipcRenderer.on('mt::ai:token-usage', subscription)
    return () => ipcRenderer.removeListener('mt::ai:token-usage', subscription)
  },
  onAgentStatus: (handler: (status: IAgentStatus) => void) => {
    const subscription = (_e: unknown, status: IAgentStatus) => handler(status)
    ipcRenderer.on('mt::ai:agent-status', subscription)
    return () => ipcRenderer.removeListener('mt::ai:agent-status', subscription)
  },
  cancelAgent: (agentId: string) => invoke('mt::ai:cancel-agent', agentId),
  detachBiscuit: (options: { conversationId?: string; projectRoot?: string }) =>
    invoke('mt::ai:detach-biscuit', options),
  setSessionContext: (context: {
    viewMode: 'page' | 'corkboard' | 'outline' | 'timeline'
    currentUnitId?: string
    currentFile?: string
  } | null) => ipcRenderer.send('mt::ai:set-session-context', context),
  onApprovalResolved: (handler: (event: { id: string }) => void) => {
    const subscription = (_e: unknown, event: { id: string }) => handler(event)
    ipcRenderer.on('mt::ai:approval-resolved', subscription)
    return () => ipcRenderer.removeListener('mt::ai:approval-resolved', subscription)
  },
  onConnectionState: (
    handler: (state: { connected: boolean; provider: string | null; model: string | null }) => void
  ) => {
    const subscription = (
      _e: unknown,
      state: { connected: boolean; provider: string | null; model: string | null }
    ) => handler(state)
    ipcRenderer.on('mt::ai:connection-state', subscription)
    return () => ipcRenderer.removeListener('mt::ai:connection-state', subscription)
  },
  onBiscuitReattach: (handler: () => void) => {
    const subscription = () => handler()
    ipcRenderer.on('mt::ai:biscuit-reattach', subscription)
    return () => ipcRenderer.removeListener('mt::ai:biscuit-reattach', subscription)
  },
  pauseAgent: (agentId: string) => invoke('mt::ai:pause-agent', agentId),
  resumeAgent: (agentId: string) => invoke('mt::ai:resume-agent', agentId),
  pause: () => invoke('mt::ai:pause'),
  resume: () => invoke('mt::ai:resume'),
  steer: (text: string) => invoke('mt::ai:steer', text),
  compactNow: () => invoke('mt::ai:compact-now'),
  onRunState: (handler: (state: { state: 'idle' | 'running' | 'paused' }) => void) => {
    const subscription = (_e: unknown, state: { state: 'idle' | 'running' | 'paused' }) =>
      handler(state)
    ipcRenderer.on('mt::ai:run-state', subscription)
    return () => ipcRenderer.removeListener('mt::ai:run-state', subscription)
  },
  fetchModels: (provider: AIProvider, apiKey: string, baseUrl?: string) =>
    invoke('mt::ai:fetch-models', provider, apiKey, baseUrl),
  pullModel: (model: string, baseUrl?: string) => invoke('mt::ai:pull-model', model, baseUrl),
  onPullProgress: (
    handler: (progress: { percent?: number; status?: string; digest?: string }) => void
  ) => {
    const subscription = (
      _e: unknown,
      progress: { percent?: number; status?: string; digest?: string }
    ) => handler(progress)
    ipcRenderer.on('mt::ai:pull-progress', subscription)
    return () => ipcRenderer.removeListener('mt::ai:pull-progress', subscription)
  },
  executeTool: (call: IAgentToolCall) => invoke('mt::ai:execute-tool', call),
  applyEdit: (request: IAgentApplyEditRequest) => invoke('mt::ai:apply-edit', request),
  writeFile: (pathname: string, content: string): Promise<{ ok: boolean; error?: string }> =>
    invoke('mt::ai:write-file', pathname, content),
  applyEditInRenderer: (request: IAgentApplyEditRequest) =>
    invoke('mt::ai:apply-edit-in-renderer', request),
  onEditProposal: (
    handler: (proposal: {
      edit: IAgentEditProposal
      oldContent: string
      originalPath: string
    }) => void
  ) => {
    const subscription = (
      _e: unknown,
      proposal: { edit: IAgentEditProposal; oldContent: string; originalPath: string }
    ) => handler(proposal)
    ipcRenderer.on('mt::ai:edit-proposal', subscription)
    return () => ipcRenderer.removeListener('mt::ai:edit-proposal', subscription)
  },
  onApplyEditInRenderer: (
    handler: (request: {
      edit: IAgentEditProposal
      oldContent: string
      originalPath: string
    }) => void
  ) => {
    const subscription = (
      _e: unknown,
      request: { edit: IAgentEditProposal; oldContent: string; originalPath: string }
    ) => handler(request)
    ipcRenderer.on('mt::ai:apply-edit-in-renderer', subscription)
    return () => ipcRenderer.removeListener('mt::ai:apply-edit-in-renderer', subscription)
  }
}

const fontsAPI = {
  list: () => invoke('mt::fonts::list')
}

const electronAPI = {
  ipcRenderer: ipcWrapper,
  shell: shellAPI,
  clipboard: clipboardAPI,
  webFrame: webFrameAPI,
  webUtils: webUtilsAPI,
  process: {
    platform: bootInfo?.platform || process.platform,
    arch: bootInfo?.arch,
    versions: bootInfo?.versions || {},
    env: bootInfo?.env || {},
    resourcesPath: bootInfo?.paths?.resources,
    cwd: bootInfo?.paths?.cwd
  },
  paths: bootInfo?.paths || {},
  isUpdatable: !!bootInfo?.isUpdatable,
  project: projectAPI,
  novel: novelAPI,
  ai: aiAPI,
  windowControl: windowControlAPI
}

// Expose a Node-`path`-compatible API to the renderer. `pathe` is a
// cross-platform reimplementation that always uses `/` separators and works
// inside a sandboxed renderer.
const pathAPI = {
  basename: (...args: Parameters<typeof pathe.basename>) => pathe.basename(...args),
  dirname: (...args: Parameters<typeof pathe.dirname>) => pathe.dirname(...args),
  extname: (...args: Parameters<typeof pathe.extname>) => pathe.extname(...args),
  join: (...args: string[]) => pathe.join(...args),
  resolve: (...args: string[]) => pathe.resolve(...args),
  relative: (...args: Parameters<typeof pathe.relative>) => pathe.relative(...args),
  isAbsolute: (...args: Parameters<typeof pathe.isAbsolute>) => pathe.isAbsolute(...args),
  normalize: (...args: Parameters<typeof pathe.normalize>) => pathe.normalize(...args),
  parse: (...args: Parameters<typeof pathe.parse>) => pathe.parse(...args),
  format: (...args: Parameters<typeof pathe.format>) => pathe.format(...args),
  sep: pathe.sep,
  delimiter: pathe.delimiter
  // Note: `pathe.posix` / `pathe.win32` are intentionally not exposed.
  // Each contains a self-reference (`pathe.posix.posix === pathe.posix`),
  // which breaks structured cloning inside `contextBridge.exposeInMainWorld`.
  // No code in this repo reads `window.path.posix` / `window.path.win32`.
}

// Bundled third-party packages occasionally read `process.platform` at module
// load time (e.g. @hfelix/electron-localshortcut/src/utils.js). Expose a
// minimal browser-safe `process` global so those imports don't throw before
// the Vue app can mount.
const processShim = {
  platform: bootInfo?.platform || process.platform,
  arch: bootInfo?.arch,
  versions: bootInfo?.versions || {},
  env: bootInfo?.env || {},
  resourcesPath: bootInfo?.paths?.resources,
  cwd: () => bootInfo?.paths?.cwd,
  // Some libraries call `process.nextTick`; map it to the microtask queue.
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    Promise.resolve().then(() => fn(...args))
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('process', processShim)
  contextBridge.exposeInMainWorld('rgPath', bootInfo?.paths?.ripgrepBinary || '')
  contextBridge.exposeInMainWorld('fileUtils', fileUtilsAPI)
  contextBridge.exposeInMainWorld('path', pathAPI)
  contextBridge.exposeInMainWorld('commandExists', commandAPI)
  contextBridge.exposeInMainWorld('i18nUtils', i18nAPI)
  contextBridge.exposeInMainWorld('ripgrep', ripgrepAPI)
  contextBridge.exposeInMainWorld('uploader', uploaderAPI)
  contextBridge.exposeInMainWorld('fonts', fontsAPI)
} catch (error) {
  console.error(error)
}
