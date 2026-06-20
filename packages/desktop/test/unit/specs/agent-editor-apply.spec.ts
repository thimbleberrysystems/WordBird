import { describe, it, expect, vi } from 'vitest'
import { applyAgentEditToCurrentFile } from '../../../src/renderer/src/services/agentEditorApply'
import type { IAgentApplyEditRequest } from '@shared/types/langgraph'
import type { IFileState } from '@shared/types/files'

// Stub the bus so emit('file-saved') in the service does not throw.
vi.mock('../../../src/renderer/src/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

// Stub the editor store to avoid pulling in the full store/config chain
// (config.ts reads window.path.sep at import time).
vi.mock('../../../src/renderer/src/store/editor', () => ({
  useEditorStore: () => ({ UPDATE_CURRENT_FILE: vi.fn() })
}))

function makeFile(overrides: Partial<IFileState> = {}): IFileState {
  return {
    id: 'file-1',
    filename: 'note.md',
    pathname: '/docs/note.md',
    markdown: 'old content',
    isSaved: true,
    ...(overrides as object)
  } as IFileState
}

function makeRequest(overrides: Partial<IAgentApplyEditRequest['edit']> = {}): IAgentApplyEditRequest {
  return {
    edit: {
      id: 'edit-1',
      filePath: '/docs/note.md',
      newContent: 'new content',
      ...overrides
    },
    oldContent: 'old content',
    originalPath: '/docs/note.md'
  } as IAgentApplyEditRequest
}

describe('applyAgentEditToCurrentFile', () => {
  it('writes the new content into the editor buffer', () => {
    const setMarkdown = vi.fn()
    const applied = applyAgentEditToCurrentFile(makeRequest(), {
      currentFile: makeFile(),
      setMarkdown
    })
    expect(applied).toBe(true)
    expect(setMarkdown).toHaveBeenCalledWith('new content')
  })

  it('calls save() after applying so the file is persisted to disk', () => {
    const save = vi.fn()
    const setMarkdown = vi.fn()
    applyAgentEditToCurrentFile(makeRequest(), {
      currentFile: makeFile(),
      setMarkdown,
      save
    })
    expect(save).toHaveBeenCalledOnce()
    // save happens after the buffer was updated
    expect(setMarkdown).toHaveBeenCalledBefore(save)
  })

  it('does not save when the path does not match the current file', () => {
    const save = vi.fn()
    const setMarkdown = vi.fn()
    const request: IAgentApplyEditRequest = {
      edit: {
        id: 'edit-1',
        filePath: '/other/elsewhere.md',
        newContent: 'new content'
      },
      oldContent: 'old content',
      originalPath: '/other/elsewhere.md'
    } as IAgentApplyEditRequest
    const applied = applyAgentEditToCurrentFile(request, {
      currentFile: makeFile(),
      setMarkdown,
      save
    })
    expect(applied).toBe(false)
    expect(setMarkdown).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('does not throw when no save callback is provided', () => {
    const applied = applyAgentEditToCurrentFile(makeRequest(), {
      currentFile: makeFile(),
      setMarkdown: vi.fn()
    })
    expect(applied).toBe(true)
  })
})
