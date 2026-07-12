/**
 * Mount smoke test: the two most complex renderer components must survive
 * setup() in an unminified, dev-like module order.
 *
 * Why this exists: a TDZ bug (watch() reading a const declared later in
 * <script setup>) crashed RightPrompt in `pnpm run dev` — taking the whole
 * workspace subtree down — while typecheck stayed silent and the MINIFIED
 * production build happened to reorder the declarations and pass e2e.
 * Vitest imports the same unminified module graph dev uses, so a
 * setup-time crash fails here.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const unsub = (): (() => void) => () => {}

beforeAll(() => {
  const invoke = vi.fn(async() => ({}))
  ;(window as unknown as Record<string, unknown>).electron = {
    ipcRenderer: { send: vi.fn(), on: vi.fn(), removeListener: vi.fn(), invoke },
    ai: {
      connect: invoke,
      disconnect: invoke,
      setMode: invoke,
      abort: invoke,
      approve: invoke,
      resetThread: invoke,
      cancelAgent: invoke,
      pauseAgent: invoke,
      resumeAgent: invoke,
      pause: invoke,
      resume: invoke,
      steer: invoke,
      compactNow: vi.fn(async() => ({ compacted: false, repaired: 0 })),
      sendMessage: invoke,
      onActivity: vi.fn(unsub),
      onApprovalRequest: vi.fn(unsub),
      onContextUsage: vi.fn(unsub),
      onPlanProposal: vi.fn(unsub),
      onPlanSaved: vi.fn(unsub),
      onTokenUsage: vi.fn(unsub),
      onAgentStatus: vi.fn(unsub),
      onRunState: vi.fn(unsub),
      onPullProgress: vi.fn(unsub),
      onEditProposal: vi.fn(unsub)
    },
    shell: { openExternal: vi.fn() },
    clipboard: { writeText: vi.fn() }
  }
  ;(window as unknown as Record<string, unknown>).path = {
    join: (...parts: string[]) => parts.join('/'),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    basename: (p: string) => p.split('/').pop() ?? p
  }
  ;(window as unknown as Record<string, unknown>).fileUtils = {
    outputFile: vi.fn(async() => {}),
    isSamePathSync: (a: string, b: string) => a === b
  }
  setActivePinia(createPinia())
})

describe('renderer mount smoke', () => {
  it('RightPrompt mounts without a setup-time crash', async() => {
    const { default: RightPrompt } = await import(
      '@/components/rightPrompt/RightPrompt.vue'
    )
    const wrapper = mount(RightPrompt, {
      global: {
        stubs: {
          // Element Plus internals and heavy children aren't the point here.
          'el-popover': true,
          'el-tooltip': true,
          'el-icon': true,
          'el-button': true,
          GlobalAgentReview: true,
          PlanCard: true,
          ErrorCard: true
        }
      }
    })
    expect(wrapper.find('.right-prompt').exists()).toBe(true)
    expect(wrapper.find('.prompt-title').text()).toContain('Biscuit')
    wrapper.unmount()
  })

  it('AgentTree mounts without a setup-time crash', async() => {
    const { default: AgentTree } = await import(
      '@/components/rightPrompt/AgentTree.vue'
    )
    const wrapper = mount(AgentTree, {
      props: { agents: [], activity: [], runState: 'idle' as const }
    })
    expect(wrapper.find('.agent-tree').exists()).toBe(true)
    wrapper.unmount()
  })
})
