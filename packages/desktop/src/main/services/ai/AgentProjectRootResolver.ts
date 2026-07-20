import path from 'path'
import type Accessor from '../../app/accessor'
import { WindowType } from '../../windows/base'
import { getBiscuitProjectRoot } from '../../windows/biscuit'

interface IEditorWindowInternal {
  openedRootDirectory?: string
  _openedFiles?: string[]
}

let _accessor: Accessor | null = null

/**
 * Last root we resolved successfully. Focus routinely sits on windows that
 * are not editors (settings, the detached Biscuit window, a native dialog);
 * on those frames the window manager reports no editor. Returning null
 * there used to drop the agent's whole state directory onto the GLOBAL
 * userData path mid-session — which is how conversations, threads and
 * pending edits leaked between projects. Remembering the last real root
 * keeps a transient focus change from rewriting where state lives.
 */
let _lastKnownRoot: string | null = null

export const setAgentToolAccessor = (accessor: Accessor): void => {
  _accessor = accessor
}

/** Test seam: forget the remembered root between cases. */
export const resetAgentProjectRootCache = (): void => {
  _lastKnownRoot = null
}

const fromActiveEditor = (): string | null => {
  if (!_accessor) return null

  const activeEditor = _accessor.windowManager.getActiveEditor()
  if (!activeEditor || activeEditor.type !== WindowType.EDITOR) return null

  const editor = activeEditor as unknown as IEditorWindowInternal

  if (editor.openedRootDirectory) return editor.openedRootDirectory

  const openedFiles: string[] = editor._openedFiles ?? []
  if (openedFiles.length > 0) {
    return path.dirname(openedFiles[0])
  }

  return null
}

export const getActiveAgentProjectRoot = (): string | null => {
  // 1. A focused editor window is the source of truth.
  const fromEditor = fromActiveEditor()
  if (fromEditor) {
    _lastKnownRoot = fromEditor
    return fromEditor
  }

  // 2. The detached Biscuit window knows the project it was opened for,
  //    but is a raw BrowserWindow the window manager never sees.
  const fromBiscuit = getBiscuitProjectRoot()
  if (fromBiscuit) {
    _lastKnownRoot = fromBiscuit
    return fromBiscuit
  }

  // 3. Nothing focused resolves — keep using the project we were last in
  //    rather than silently switching to global state.
  return _lastKnownRoot
}
