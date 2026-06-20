import path from 'path'
import type Accessor from '../../app/accessor'
import { WindowType } from '../../windows/base'

interface IEditorWindowInternal {
  openedRootDirectory?: string
  _openedFiles?: string[]
}

let _accessor: Accessor | null = null

export const setAgentToolAccessor = (accessor: Accessor): void => {
  _accessor = accessor
}

export const getActiveAgentProjectRoot = (): string | null => {
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
