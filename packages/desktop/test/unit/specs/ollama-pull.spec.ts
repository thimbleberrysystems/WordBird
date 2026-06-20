import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock window.electron for the test
const mockElectron = {
  ai: {
    pullModel: vi.fn()
  }
}

const win = window as unknown as { electron?: typeof mockElectron }

describe('ollama pull model functionality', () => {
  beforeEach(() => {
    vi.resetModules()
    win.electron = mockElectron
    mockElectron.ai.pullModel.mockReset()
  })

  afterEach(() => {
    delete win.electron
  })

  it('calls pullModel with correct model name', async () => {
    const { langGraphService } = await import('../../../src/renderer/src/services/langgraph')

    mockElectron.ai.pullModel.mockResolvedValue({ success: true })

    await langGraphService.pullModel('phi3', 'http://127.0.0.1:11434')

    expect(mockElectron.ai.pullModel).toHaveBeenCalledWith('phi3', 'http://127.0.0.1:11434')
  })

  it('handles pullModel errors gracefully', async () => {
    const { langGraphService } = await import('../../../src/renderer/src/services/langgraph')

    mockElectron.ai.pullModel.mockRejectedValue(new Error('Model not found'))

    await expect(langGraphService.pullModel('nonexistent-model')).rejects.toThrow('Model not found')
  })

  it('uses default baseUrl when not provided', async () => {
    const { langGraphService } = await import('../../../src/renderer/src/services/langgraph')

    mockElectron.ai.pullModel.mockResolvedValue({ success: true })

    await langGraphService.pullModel('llama3')

    expect(mockElectron.ai.pullModel).toHaveBeenCalledWith('llama3', undefined)
  })
})
