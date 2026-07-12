import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  addFile,
  unlinkFile,
  addDirectory,
  unlinkDirectory,
  resortTree,
  updateFileMtime
} from './treeCtrl'
import { usePreferencesStore } from './preferences'
import bus from '../bus'
import { create, paste, rename } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { debouncedSendBufferedState } from './bufferedState'
import type { ProjectFlavor } from '@shared/types/novel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProjectTree = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeChange = any

const normalizeProjectRoot = (pathname: string | null | undefined): string => {
  return pathname ? window.path.normalize(pathname) : ''
}

const createProjectRoot = (pathname: string): ProjectTree | null => {
  const normalizedPathname = normalizeProjectRoot(pathname)
  if (!normalizedPathname) return null

  let name = window.path.basename(normalizedPathname)
  if (!name) {
    // Root directory such as "/" or "C:\"
    name = normalizedPathname
  }

  return {
    pathname: normalizedPathname,
    name,
    isDirectory: true,
    isFile: false,
    isMarkdown: false,
    folders: [],
    files: []
  }
}

interface BufferedProjectState {
  rootDirectory: string
}

const createBufferedProjectState = (state: unknown): BufferedProjectState => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (state || {}) as any
  return {
    rootDirectory: normalizeProjectRoot(s.rootDirectory || s.projectTree?.pathname)
  }
}

interface OpenProjectOptions {
  scheduleBufferUpdate?: boolean
}

interface CreateCacheEntry {
  dirname: string
  type: 'file' | 'directory' | string
}

interface ClipboardEntry {
  type: 'copy' | 'cut' | string
  src: string
  dest?: string
}

interface PendingEvent {
  type: string
  change: TreeChange
}

export const useProjectStore = defineStore('project', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeItem = ref<any>({})
  const createCache = ref<CreateCacheEntry | Record<string, never>>({})
  const newFileNameCache = ref<string>('')
  const renameCache = ref<string | null>(null)
  const clipboard = ref<ClipboardEntry | null>(null)
  const currentProjectPath = ref<string | null>(null)

  /**
   * Adopt a project path WITHOUT loading the tree — used by the detached
   * Biscuit window, which only needs the root for transcripts/snapshots.
   */
  function ADOPT_PROJECT_PATH(pathname: string): void {
    currentProjectPath.value = pathname
  }
  const projectTree = ref<ProjectTree | null>(null)
  const pendingTreeEvents = ref<PendingEvent[]>([])

  const preferencesStore = usePreferencesStore()

  watch(
    [() => preferencesStore.fileSortBy, () => preferencesStore.fileSortOrder],
    ([sortBy, sortOrder]) => {
      if (projectTree.value) {
        resortTree(projectTree.value, String(sortBy), String(sortOrder))
      }
    }
  )

  async function OPEN_PROJECT(
    pathname: string,
    { scheduleBufferUpdate = true }: OpenProjectOptions = {}
  ): Promise<void> {
    const layoutStore = useLayoutStore()

    // Verify project still exists on disk before opening
    const isValid = await window.electron.project.validate(pathname)
    if (!isValid) {
      console.warn(`Attempted to open invalid or non-existent project: ${pathname}`)
      projectTree.value = null
      currentProjectPath.value = null
      return
    }

    const tree = createProjectRoot(pathname)
    if (!tree) return

    projectTree.value = tree
    currentProjectPath.value = pathname

    const layout = {
      rightColumn: 'binder',
      showSideBar: true,
      showTabBar: true
    }
    layoutStore.SET_LAYOUT(layout, { scheduleBufferUpdate })
    layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()

    // Process pending events that arrived before projectTree was initialized.
    for (const event of pendingTreeEvents.value) {
      _processTreeEvent(event.type, event.change)
    }
    pendingTreeEvents.value = []

    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function setCurrentProject(pathname: string | null): void {
    if (!pathname) {
      currentProjectPath.value = null
      projectTree.value = null
      return
    }
    if (currentProjectPath.value === pathname) return
    currentProjectPath.value = pathname
  }

  const createProject = async(flavor?: ProjectFlavor): Promise<void> => {
    try {
      await window.electron.project.create(flavor ? { flavor } : {})
      // The main process will emit 'mt::open-directory' to trigger file loading
    } catch (err) {
      console.error('Project creation failed:', err)
    }
  }

  const loadProject = async(): Promise<void> => {
    try {
      await window.electron.project.load()
      // The main process will emit 'mt::open-directory' to trigger file loading
    } catch (err) {
      console.error('Project load failed:', err)
    }
  }

  function CREATE_BUFFERED_STATE(): BufferedProjectState {
    return createBufferedProjectState({
      projectTree: projectTree.value
    })
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const { rootDirectory } = createBufferedProjectState(state)
    if (rootDirectory) {
      if (projectTree.value?.pathname === rootDirectory) return
      OPEN_PROJECT(rootDirectory, { scheduleBufferUpdate: false })
    } else {
      projectTree.value = null
      pendingTreeEvents.value = []
    }
  }

  function LISTEN_FOR_LOAD_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::open-directory', (_e, pathname) => {
      OPEN_PROJECT(String(pathname))
    })
  }

  function LISTEN_FOR_PROJECT_REQUESTS(): void {
    window.electron.ipcRenderer.on('mt::project:create-request', () => {
      createProject()
    })
    window.electron.ipcRenderer.on('mt::project:load-request', () => {
      loadProject()
    })
    window.electron.ipcRenderer.on('mt::project:save-as-request', () => {
      saveProjectAs()
    })
  }

  const saveProjectAs = async(): Promise<void> => {
    if (!currentProjectPath.value) return
    try {
      await window.electron.project.saveAs(currentProjectPath.value)
    } catch (err) {
      console.error('Project save as failed:', err)
    }
  }

  function LISTEN_FOR_UPDATE_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::update-object-tree', (_e, payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { type, change } = (payload as any) ?? {}
      if (!projectTree.value) {
        pendingTreeEvents.value.push({ type, change })
        return
      }
      _processTreeEvent(type, change)
    })
  }

  function _processTreeEvent(type: string, change: TreeChange): void {
    const editorStore = useEditorStore()
    switch (type) {
      case 'add': {
        const { pathname, data, isMarkdown } = change
        addFile(
          projectTree.value,
          change,
          String(preferencesStore.fileSortBy),
          String(preferencesStore.fileSortOrder)
        )
        if (isMarkdown && newFileNameCache.value && pathname === newFileNameCache.value) {
          const fileState = getFileStateFromData(data)
          editorStore.UPDATE_CURRENT_FILE(fileState)
          newFileNameCache.value = ''
        }
        break
      }
      case 'unlink':
        unlinkFile(projectTree.value, change)
        editorStore.SET_SAVE_STATUS_WHEN_REMOVE(change)
        break
      case 'addDir':
        addDirectory(projectTree.value, change)
        break
      case 'unlinkDir':
        unlinkDirectory(projectTree.value, change)
        break
      case 'change':
        if (change?.mtimeMs !== undefined) {
          updateFileMtime(
            projectTree.value,
            change,
            String(preferencesStore.fileSortBy),
            String(preferencesStore.fileSortOrder)
          )
        }
        break
      default:
        if (window.electron?.process?.env?.NODE_ENV === 'development') {
          console.log(`Unknown directory watch type: "${type}"`)
        }
        break
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function CHANGE_ACTIVE_ITEM(item: any): void {
    activeItem.value = item
  }

  function CHANGE_CLIPBOARD(data: ClipboardEntry | null): void {
    clipboard.value = data
  }

  function ASK_FOR_OPEN_PROJECT(): void {
    window.electron.ipcRenderer.send('mt::ask-for-open-project-in-sidebar')
  }

  function LISTEN_FOR_SIDEBAR_CONTEXT_MENU(): void {
    bus.on('SIDEBAR::show-in-folder', () => {
      const { pathname } = activeItem.value
      window.electron.shell.showItemInFolder(pathname)
    })
    bus.on('SIDEBAR::new', (type: unknown) => {
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      createCache.value = { dirname, type: String(type) }
      bus.emit('SIDEBAR::show-new-input')
    })
    bus.on('SIDEBAR::remove', () => {
      const { pathname } = activeItem.value
      window.electron.ipcRenderer.invoke('mt::fs-trash-item', pathname).catch((err) => {
        notice.notify({
          title: 'Error while deleting',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
    })
    bus.on('SIDEBAR::copy-cut', (type: unknown) => {
      const { pathname: src } = activeItem.value
      clipboard.value = { type: String(type), src }
    })
    bus.on('SIDEBAR::paste', () => {
      const cb = clipboard.value
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      if (cb && cb.src) {
        cb.dest = dirname + PATH_SEPARATOR + window.path.basename(cb.src)

        if (window.path.normalize(cb.src) === window.path.normalize(cb.dest)) {
          notice.notify({
            title: 'Paste Forbidden',
            type: 'warning',
            message: 'Source and destination must not be the same.'
          })
          return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paste(cb as any)
          .then(() => {
            clipboard.value = null
          })
          .catch((err) => {
            notice.notify({
              title: 'Error while pasting',
              type: 'error',
              message: err instanceof Error ? err.message : String(err)
            })
          })
      }
    })
    bus.on('SIDEBAR::rename', () => {
      const { pathname } = activeItem.value
      renameCache.value = pathname
      bus.emit('SIDEBAR::show-rename-input')
    })
  }

  function CREATE_FILE_DIRECTORY(name: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cache = createCache.value as any
    const { dirname, type } = cache

    if (type === 'file' && !window.fileUtils.hasMarkdownExtension(name)) {
      name += '.md'
    }

    const fullName = `${dirname}/${name}`

    create(fullName, type)
      .then(() => {
        createCache.value = {}
        if (type === 'file') {
          newFileNameCache.value = fullName
        }
      })
      .catch((err) => {
        notice.notify({
          title: 'Error in Side Bar',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
  }

  function RENAME_IN_SIDEBAR(name: string): void {
    const editorStore = useEditorStore()
    const src = renameCache.value
    if (!src) return
    const dirname = window.path.dirname(src)
    const dest = dirname + PATH_SEPARATOR + name
    rename(src, dest).then(() => {
      editorStore.RENAME_IF_NEEDED({ src, dest })
    })
  }

  function OPEN_SETTING_WINDOW(): void {
    window.electron.ipcRenderer.send('mt::open-setting-window')
  }

  return {
    activeItem,
    createCache,
    newFileNameCache,
    renameCache,
    clipboard,
    currentProjectPath,
    ADOPT_PROJECT_PATH,
    projectTree,
    pendingTreeEvents,
    OPEN_PROJECT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    LISTEN_FOR_LOAD_PROJECT,
    LISTEN_FOR_PROJECT_REQUESTS,
    LISTEN_FOR_UPDATE_PROJECT,
    createProject,
    loadProject,
    setCurrentProject,
    CHANGE_ACTIVE_ITEM,
    CHANGE_CLIPBOARD,
    ASK_FOR_OPEN_PROJECT,
    LISTEN_FOR_SIDEBAR_CONTEXT_MENU,
    CREATE_FILE_DIRECTORY,
    RENAME_IN_SIDEBAR,
    OPEN_SETTING_WINDOW
  }
})
