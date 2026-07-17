/**
 * Agents store: when a run ends, no row may keep showing "running" —
 * interrupted SDK subagents never send a completion event, so the store
 * closes them out itself (cancelled after Stop, done otherwise).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { IAgentStatus } from '@shared/types/langgraph'

vi.mock('../../../src/renderer/src/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

type StatusHandler = (status: IAgentStatus) => void
type RunStateHandler = (event: { state: 'idle' | 'running' | 'paused' }) => void

let statusHandler: StatusHandler = () => {}
let runStateHandler: RunStateHandler = () => {}
const abortMock = vi.fn()

beforeEach(() => {
  setActivePinia(createPinia())
  abortMock.mockClear()
  ;(globalThis as Record<string, unknown>).window = Object.assign(
    (globalThis as unknown as { window?: Record<string, unknown> }).window ?? {},
    {
      electron: {
        ai: {
          onAgentStatus: (handler: StatusHandler) => {
            statusHandler = handler
            return () => {}
          },
          onActivity: () => () => {},
          onRunState: (handler: RunStateHandler) => {
            runStateHandler = handler
            return () => {}
          },
          abort: abortMock,
          cancelAgent: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          pauseAgent: vi.fn(),
          resumeAgent: vi.fn()
        }
      }
    }
  )
})

const runningAgent = (agentId: string): IAgentStatus => ({
  agentId,
  role: 'researcher',
  task: 'look things up',
  status: 'running',
  startedAt: Date.now() - 5000,
  toolCalls: 3
})

describe('agents store run-end close-out', () => {
  it('Stop marks lingering running agents as CANCELLED', async() => {
    const { useAgentsStore } = await import('../../../src/renderer/src/store/agents')
    const store = useAgentsStore()
    store.init()
    statusHandler(runningAgent('a1'))
    statusHandler(runningAgent('a2'))
    expect(store.runningCount).toBe(2)

    await store.stopAll()
    expect(abortMock).toHaveBeenCalled()
    runStateHandler({ state: 'idle' })

    expect(store.runningCount).toBe(0)
    for (const agent of store.agentList) {
      expect(agent.status).toBe('cancelled')
      expect(agent.endedAt).toBeGreaterThan(0)
    }
  })

  it('a normal run end closes stale rows as done, not cancelled', async() => {
    const { useAgentsStore } = await import('../../../src/renderer/src/store/agents')
    const store = useAgentsStore()
    store.init()
    statusHandler(runningAgent('a1'))
    runStateHandler({ state: 'idle' })
    expect(store.agentList[0].status).toBe('done')
  })
})
