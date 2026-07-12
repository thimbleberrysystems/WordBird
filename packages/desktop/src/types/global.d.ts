// Renderer-side global declarations: build-time defines (electron-vite
// `define` block in electron.vite.config.ts), the contextBridge surface
// exposed by src/preload/index.ts, and a handful of legacy globals that
// survived the sandbox migration.

import type {
  IpcInvokeChannels,
  IpcSendChannels,
  IpcSyncChannels,
  IpcMainEventChannels,
  BootInfo,
  ProjectCreateArgs,
  ProjectCreateResult,
  ProjectLoadArgs,
  ProjectLoadResult
} from '@shared/types/ipc'
import type { MenuTemplate, MenuPopupPosition } from '@shared/types/menu'
import type { SerializedStat } from '@shared/types/files'
import type {
  IAIConfig,
  ILangGraphMessage,
  ILangGraphResponse,
  IAgentToolCall,
  IAgentToolResult,
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
  INovelStructureResult,
  INovelCompileResult,
  ISnapshotListResult,
  ISnapshotActionResult,
  IContinuityListResult,
  IRevisionListResult,
  ProjectFlavor
} from '@shared/types/novel'

declare global {
  // ---- Build-time defines (electron-vite `define`) ----
  const MARKTEXT_VERSION: string
  const MARKTEXT_VERSION_STRING: string
  const __static: string

  // ---- contextBridge surface ----

  interface ElectronIpcRenderer {
    send<K extends keyof IpcSendChannels>(channel: K, ...args: IpcSendChannels[K]): void
    sendSync<K extends keyof IpcSyncChannels>(
      channel: K,
      ...args: IpcSyncChannels[K]['args']
    ): IpcSyncChannels[K]['ret']
    invoke<K extends keyof IpcInvokeChannels>(
      channel: K,
      ...args: IpcInvokeChannels[K]['args']
    ): Promise<IpcInvokeChannels[K]['ret']>
    on<K extends keyof IpcMainEventChannels>(
      channel: K,
      listener: (event: unknown, ...args: IpcMainEventChannels[K]) => void
    ): () => void
    once<K extends keyof IpcMainEventChannels>(
      channel: K,
      listener: (event: unknown, ...args: IpcMainEventChannels[K]) => void
    ): () => void
    removeAllListeners(channel: keyof IpcMainEventChannels | string): void
  }

  interface ElectronShellAPI {
    openExternal(url: string): Promise<void>
    showItemInFolder(fullPath: string): void
    openPath(fullPath: string): Promise<string>
  }

  interface ElectronClipboardAPI {
    writeText(text: string): void
    readText(): Promise<string>
    guessFilePath(): Promise<string | null>
  }

  interface ElectronWebFrameAPI {
    setZoomFactor(factor: number): void
    setZoomLevel(level: number): void
  }

  interface ElectronWebUtilsAPI {
    getPathForFile(file: File): string
  }

  interface ElectronWindowControlAPI {
    minimize(): void
    maximize(): void
    unmaximize(): void
    toggleMaximize(): void
    close(): void
    setFullScreen(flag: boolean): void
    toggleFullScreen(): void
    isMaximized(): Promise<boolean>
    isFullScreen(): Promise<boolean>
    popupMenu(template: MenuTemplate, position?: MenuPopupPosition): void
    popupApplicationMenu(position?: MenuPopupPosition): void
  }

  interface ElectronAPI {
    ipcRenderer: ElectronIpcRenderer
    shell: ElectronShellAPI
    clipboard: ElectronClipboardAPI
    webFrame: ElectronWebFrameAPI
    webUtils: ElectronWebUtilsAPI
    process: {
      platform: NodeJS.Platform
      arch?: string
      versions: Record<string, string>
      env: Record<string, string>
      resourcesPath?: string
      cwd?: string
    }
    paths: Partial<BootInfo['paths']>
    isUpdatable: boolean
    project: {
      create: (args?: ProjectCreateArgs) => Promise<ProjectCreateResult>
      load: (args?: ProjectLoadArgs) => Promise<ProjectLoadResult>
      validate: (path: string) => Promise<boolean>
      saveAs: (currentPath: string) => Promise<ProjectCreateResult>
    }
    novel: {
      getStructure: (root: string) => Promise<INovelStructureResult>
      initStructure: (root: string, flavor: ProjectFlavor) => Promise<INovelStructureResult>
      createUnit: (
        root: string,
        payload: INovelCreateUnitPayload
      ) => Promise<INovelStructureResult>
      updateUnit: (
        root: string,
        unitId: string,
        update: INovelUnitUpdate
      ) => Promise<INovelStructureResult>
      moveUnit: (
        root: string,
        unitId: string,
        newParentId: string | null,
        index: number
      ) => Promise<INovelStructureResult>
      deleteUnit: (
        root: string,
        unitId: string,
        deleteFiles: boolean
      ) => Promise<INovelStructureResult>
      compile: (root: string, options?: INovelCompileOptions) => Promise<INovelCompileResult>
      snapshot: (root: string, message: string) => Promise<ISnapshotActionResult>
      listSnapshots: (root: string, limit?: number) => Promise<ISnapshotListResult>
      restoreSnapshot: (root: string, snapshotId: string) => Promise<ISnapshotActionResult>
      continuityIssues: (root: string) => Promise<IContinuityListResult>
      listRevisions: (root: string) => Promise<IRevisionListResult>
      resolveIssue: (root: string, issueId: string) => Promise<{ ok: boolean; error?: string }>
    }
    ai: {
      connect: (config: IAIConfig) => Promise<void>
      disconnect: () => Promise<void>
      sendMessage: (messages: ILangGraphMessage[]) => Promise<ILangGraphResponse>
      abort: () => Promise<void>
      resetThread: () => Promise<{ threadId: string }>
      setMode: (mode: AgentPermissionMode) => Promise<{ mode: AgentPermissionMode }>
      getMode: () => Promise<{ mode: AgentPermissionMode }>
      approve: (approvalId: string, approved: boolean) => Promise<{ handled: boolean }>
      onActivity: (handler: (event: IAgentActivityEvent) => void) => () => void
      onApprovalRequest: (handler: (request: IAgentApprovalRequest) => void) => () => void
      onContextUsage: (handler: (usage: IContextUsage) => void) => () => void
      onPlanSaved: (handler: (event: { path: string }) => void) => () => void
      onPlanProposal: (handler: (plan: IPlanProposal) => void) => () => void
      onTokenUsage: (handler: (usage: ITokenUsageUpdate) => void) => () => void
      onAgentStatus: (handler: (status: IAgentStatus) => void) => () => void
      cancelAgent: (agentId: string) => Promise<{ cancelled: boolean }>
      detachBiscuit: (options: {
        conversationId?: string
        projectRoot?: string
      }) => Promise<{ ok: boolean }>
      onApprovalResolved: (handler: (event: { id: string }) => void) => () => void
      onBiscuitReattach: (handler: () => void) => () => void
      onConnectionState: (
        handler: (state: {
          connected: boolean
          provider: string | null
          model: string | null
        }) => void
      ) => () => void
      pauseAgent: (agentId: string) => Promise<{ paused: boolean }>
      resumeAgent: (agentId: string) => Promise<{ resumed: boolean }>
      pause: () => Promise<{ paused: boolean }>
      resume: () => Promise<{ resumed: boolean }>
      steer: (text: string) => Promise<{ queued: boolean }>
      compactNow: () => Promise<{ compacted: boolean; repaired: number; busy?: boolean }>
      onRunState: (
        handler: (state: { state: 'idle' | 'running' | 'paused' }) => void
      ) => () => void
      fetchModels: (provider: AIProvider, apiKey: string, baseUrl?: string) => Promise<string[]>
      pullModel: (model: string, baseUrl?: string) => Promise<{ success: boolean }>
      onPullProgress: (
        handler: (progress: { percent?: number; status?: string; digest?: string }) => void
      ) => () => void
      executeTool: (call: IAgentToolCall) => Promise<IAgentToolResult>
      applyEdit: (request: IAgentApplyEditRequest) => Promise<{ ok: boolean; error?: string }>
      writeFile: (pathname: string, content: string) => Promise<{ ok: boolean; error?: string }>
      applyEditInRenderer: (request: IAgentApplyEditRequest) => Promise<{ ok: boolean; error?: string }>
      onEditProposal: (
        handler: (proposal: {
          edit: IAgentEditProposal
          oldContent: string
          originalPath: string
        }) => void
      ) => () => void
      onApplyEditInRenderer: (
        handler: (request: {
          edit: IAgentEditProposal
          oldContent: string
          originalPath: string
        }) => void
      ) => () => void
    }
    windowControl: ElectronWindowControlAPI
  }

  interface FileUtilsAPI {
    isFile(p: string): Promise<boolean>
    isDirectory(p: string): Promise<boolean>
    emptyDir(p: string): Promise<void>
    copy(src: string, dest: string): Promise<void>
    ensureDir(p: string): Promise<void>
    outputFile(p: string, data: string | Uint8Array): Promise<void>
    move(src: string, dest: string): Promise<void>
    stat(p: string): Promise<SerializedStat>
    writeFile(p: string, data: string | Uint8Array): Promise<void>
    readFile(p: string, encoding?: string): Promise<string | Uint8Array>
    pathExists(p: string): Promise<boolean>
    unlink(p: string): Promise<void>
    readdir(p: string): Promise<string[]>
    isExecutable(p: string): Promise<boolean>
    isChildOfDirectory(dir: string, child: string): boolean
    hasMarkdownExtension(filename: string): boolean
    isSamePathSync(a: string, b: string, isNormalized?: boolean): boolean
    isImageFile(p: string): Promise<boolean>
    MARKDOWN_INCLUSIONS: string[]
  }

  interface PathAPI {
    basename(path: string, ext?: string): string
    dirname(path: string): string
    extname(path: string): string
    join(...paths: string[]): string
    resolve(...paths: string[]): string
    relative(from: string, to: string): string
    isAbsolute(path: string): boolean
    normalize(path: string): string
    parse(path: string): { root: string; dir: string; base: string; ext: string; name: string }
    format(pathObject: {
      root?: string
      dir?: string
      base?: string
      ext?: string
      name?: string
    }): string
    sep: string
    delimiter: string
  }

  interface CommandExistsAPI {
    exists(name: string): Promise<boolean>
  }

  interface I18nUtilsAPI {
    loadTranslations(language: string): Promise<Record<string, unknown>>
  }

  interface RipgrepAPI {
    start(req: unknown): Promise<{ searchId: string }>
    cancel(searchId: string): void
    onMatch(handler: (payload: unknown) => void): () => void
    onProgress(handler: (payload: unknown) => void): () => void
    onDone(handler: (payload: unknown) => void): () => void
    onError(handler: (payload: unknown) => void): () => void
    onCancelled(handler: (payload: unknown) => void): () => void
  }

  interface UploaderAPI {
    uploadImage(req: unknown): Promise<unknown>
  }

  interface FontsAPI {
    list(): Promise<string[]>
  }

  interface ProcessShim {
    platform: NodeJS.Platform
    arch?: string
    versions: Record<string, string>
    env: Record<string, string>
    resourcesPath?: string
    cwd: () => string | undefined
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => void
  }

  interface Window {
    electron: ElectronAPI
    fileUtils: FileUtilsAPI
    path: PathAPI
    commandExists: CommandExistsAPI
    i18nUtils: I18nUtilsAPI
    ripgrep: RipgrepAPI
    uploader: UploaderAPI
    fonts: FontsAPI
    process: ProcessShim
    rgPath: string
    // Set by the legacy editor store at runtime; consumed by muya internals.
    DIRNAME: string
    wordbird?: {
      env?: { windowId: number; [key: string]: unknown }
      initialState?: {
        codeFontFamily?: string | null
        codeFontSize?: string | null
        hideScrollbar?: boolean
        theme?: string | null
        titleBarStyle?: string | null
        [key: string]: unknown
      }
      paths?: { ripgrepBinaryPath?: string; [key: string]: unknown }
      [key: string]: unknown
    }
  }
}

export {}
