import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import {
  useConversationHistory,
  type ChatEntry
} from '../../../src/renderer/src/composables/useConversationHistory'

// Transient UI cards — a quiet-run notice, an error card, a stopped marker —
// are furniture, not conversation. saveCurrent must keep them out of the saved
// history AND the agent-searchable transcript at .wordbird/transcripts.

vi.mock('../../../src/renderer/src/store/project', () => ({
  useProjectStore: () => ({ currentProjectPath: null })
}))

const entry = (role: ChatEntry['role'], content: string): ChatEntry => ({ role, content })

describe('conversation persistence filters transient UI roles', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('saveCurrent persists only the real dialogue, never notice/error/stopped', () => {
    const aiMessages = ref<ChatEntry[]>([
      entry('user', 'Draft the opening scene.'),
      entry('assistant', 'Here is a draft…'),
      entry('notice', 'Biscuit is still working — no output for a while.'),
      entry('error', 'Something failed.'),
      entry('stopped', 'Run stopped.')
    ])
    const history = useConversationHistory({
      aiMessages,
      isBusy: () => false,
      onSwitch: () => {}
    })

    history.saveCurrent()

    const saved = history.conversations.value
    expect(saved).toHaveLength(1)
    expect(saved[0].messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(JSON.stringify(saved[0].messages)).not.toContain('still working')
    expect(JSON.stringify(saved[0].messages)).not.toContain('Something failed')
  })

  it('a turn that produced ONLY transient cards saves nothing', () => {
    // e.g. the writer sent nothing yet a quiet-notice appeared — there is no
    // conversation to persist, so no empty entry is created.
    const aiMessages = ref<ChatEntry[]>([
      entry('notice', 'still working'),
      entry('error', 'boom')
    ])
    const history = useConversationHistory({
      aiMessages,
      isBusy: () => false,
      onSwitch: () => {}
    })

    history.saveCurrent()

    expect(history.conversations.value).toHaveLength(0)
  })
})
