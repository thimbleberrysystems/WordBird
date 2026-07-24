import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
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

describe('conversation persistence is debounced on the hot path', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a burst of message mutations coalesces into one delayed save', async() => {
    const aiMessages = ref<ChatEntry[]>([])
    const history = useConversationHistory({
      aiMessages,
      isBusy: () => false,
      onSwitch: () => {}
    })

    aiMessages.value.push(entry('user', 'a'))
    aiMessages.value.push(entry('assistant', 'b'))
    await nextTick() // the deep watch fires once and SCHEDULES the save

    // Not written yet — the expensive clone+localStorage write is deferred.
    expect(history.conversations.value).toHaveLength(0)

    vi.advanceTimersByTime(400)
    // Now the single coalesced save has run.
    expect(history.conversations.value).toHaveLength(1)
    expect(history.conversations.value[0].messages.map((m) => m.role)).toEqual([
      'user',
      'assistant'
    ])
  })

  it('an explicit saveCurrent still writes immediately (switch/new/load path)', () => {
    const aiMessages = ref<ChatEntry[]>([entry('user', 'x'), entry('assistant', 'y')])
    const history = useConversationHistory({
      aiMessages,
      isBusy: () => false,
      onSwitch: () => {}
    })

    history.saveCurrent()
    // No timer advance — the explicit path is synchronous.
    expect(history.conversations.value).toHaveLength(1)
  })
})
