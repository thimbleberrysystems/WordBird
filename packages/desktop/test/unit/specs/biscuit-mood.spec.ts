/**
 * Biscuit mascot: the mood state machine (useBiscuitMood) and the mascot
 * component's contract. The mascot is companionship, not status — so these
 * pin mood timing, caption rotation, the click reaction, reduced-motion, and
 * that the 1s ticker never leaks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, ref, nextTick, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import {
  useBiscuitMood,
  LONGWAIT_MS,
  CELEBRATE_MS,
  ACTS,
  type BiscuitMoodApi
} from '@/composables/useBiscuitMood'
import BiscuitMascot from '@/components/rightPrompt/BiscuitMascot.vue'

interface Harness {
  sending: Ref<boolean>
  runState: Ref<'idle' | 'running' | 'paused'>
  connected: Ref<boolean>
  api: BiscuitMoodApi
  unmount: () => void
}

const makeMood = (init?: { sending?: boolean; runState?: 'idle' | 'running' | 'paused' }): Harness => {
  const sending = ref(init?.sending ?? false)
  const runState = ref<'idle' | 'running' | 'paused'>(init?.runState ?? 'idle')
  const connected = ref(true)
  let api!: BiscuitMoodApi
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useBiscuitMood({ sending, runState, connected })
        return () => null
      }
    })
  )
  return { sending, runState, connected, get api() { return api }, unmount: () => wrapper.unmount() }
}

describe('useBiscuitMood', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('idle when nothing is running; busy the moment a run starts', async() => {
    const h = makeMood()
    expect(h.api.mood.value).toBe('idle')
    h.sending.value = true
    await nextTick()
    expect(h.api.mood.value).toBe('busy')
    h.unmount()
  })

  it('shifts busy → longwait after LONGWAIT_MS, then celebrates and settles to idle', async() => {
    const h = makeMood({ sending: true })
    await nextTick()
    expect(h.api.mood.value).toBe('busy')
    vi.advanceTimersByTime(LONGWAIT_MS)
    expect(h.api.mood.value).toBe('longwait')
    h.sending.value = false
    await nextTick()
    // A finished run celebrates briefly before bowing out.
    expect(h.api.mood.value).toBe('celebrate')
    vi.advanceTimersByTime(CELEBRATE_MS + 2000)
    expect(h.api.mood.value).toBe('idle')
    h.unmount()
  })

  it('celebrates only after a REAL run ends, never on first mount', async() => {
    const fresh = makeMood()
    expect(fresh.api.mood.value).toBe('idle')
    fresh.unmount()

    const h = makeMood({ sending: true })
    await nextTick()
    h.sending.value = false
    await nextTick()
    expect(h.api.mood.value).toBe('celebrate')
    vi.advanceTimersByTime(CELEBRATE_MS + 2000)
    expect(h.api.mood.value).toBe('idle')
    h.unmount()
  })

  it('paused wins over the longwait timer while a run is paused', async() => {
    const h = makeMood({ sending: true })
    await nextTick()
    vi.advanceTimersByTime(LONGWAIT_MS)
    expect(h.api.mood.value).toBe('longwait')
    h.runState.value = 'paused'
    expect(h.api.mood.value).toBe('paused')
    h.runState.value = 'running'
    expect(h.api.mood.value).toBe('longwait')
    h.unmount()
  })

  it('poke() shows the react mood, then reverts', async() => {
    const h = makeMood({ sending: true })
    await nextTick()
    h.api.poke()
    expect(h.api.mood.value).toBe('react')
    // A quip is shown while reacting.
    expect(h.api.caption.value.length).toBeGreaterThan(0)
    vi.advanceTimersByTime(3000)
    expect(h.api.mood.value).toBe('busy')
    h.unmount()
  })

  it('turns the caption over IN STEP with each act change (same beat, not a separate clock)', async() => {
    const h = makeMood({ sending: true })
    await nextTick()
    const firstCaption = h.api.caption.value
    const firstAct = h.api.actName.value
    // Before the act's dwell time is up, the caption has NOT changed…
    vi.advanceTimersByTime(ACTS[0].hold - 2000)
    expect(h.api.actName.value).toBe(firstAct)
    expect(h.api.caption.value).toBe(firstCaption)
    // …and it turns over exactly when the act does.
    vi.advanceTimersByTime(3000)
    expect(h.api.actName.value).not.toBe(firstAct)
    expect(h.api.caption.value).not.toBe(firstCaption)
    h.unmount()
  })

  it('runs one ticker while mounted and clears it on unmount (no leak)', async() => {
    const h = makeMood({ sending: true })
    await nextTick()
    // Exactly one interval keeps Biscuit lively for the panel's lifetime…
    expect(vi.getTimerCount()).toBe(1)
    h.sending.value = false
    await nextTick()
    expect(vi.getTimerCount()).toBe(1) // still ticking on the welcome/idle card
    h.unmount()
    // …and it is cleared on unmount.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drifts through its repertoire of acts, each held for its OWN dwell time', async() => {
    const h = makeMood({ sending: true })
    await nextTick()
    expect(h.api.act.value).toBe(0)
    expect(h.api.actName.value).toBe(ACTS[0].name)
    // The first act holds for ITS OWN dwell time — not a shared metronome —
    // then Biscuit drifts to the next.
    vi.advanceTimersByTime(ACTS[0].hold + 1000)
    expect(h.api.act.value).toBe(1)
    expect(h.api.actName.value).toBe(ACTS[1].name)
    // Keeps naming a valid act as it wraps around the whole repertoire.
    let total = 0
    for (const a of ACTS) total += a.hold + 1000
    vi.advanceTimersByTime(total)
    expect(ACTS.map((a) => a.name)).toContain(h.api.actName.value)
    h.unmount()
  })

  it('freezes the act cycle under prefers-reduced-motion', async() => {
    const original = window.matchMedia
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
    try {
      const h = makeMood({ sending: true })
      await nextTick()
      const first = h.api.act.value
      vi.advanceTimersByTime(ACTS[0].hold * 3)
      expect(h.api.act.value).toBe(first)
      h.unmount()
    } finally {
      ;(window as unknown as { matchMedia: unknown }).matchMedia = original
    }
  })

  it('freezes caption rotation under prefers-reduced-motion', async() => {
    const original = window.matchMedia
    // jsdom has no matchMedia; simulate "reduce".
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
    try {
      const h = makeMood({ sending: true })
      await nextTick()
      expect(h.api.reducedMotion.value).toBe(true)
      const first = h.api.caption.value
      // Acts (and therefore captions) are frozen under reduced motion.
      vi.advanceTimersByTime(ACTS[0].hold * 3)
      expect(h.api.caption.value).toBe(first)
      h.unmount()
    } finally {
      ;(window as unknown as { matchMedia: unknown }).matchMedia = original
    }
  })
})

describe('BiscuitMascot component', () => {
  it('exposes the mood class, an accessible label, and emits react on click', async() => {
    const wrapper = mount(BiscuitMascot, { props: { mood: 'busy' } })
    expect(wrapper.classes()).toContain('mascot--busy')
    const svg = wrapper.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBeTruthy()
    await wrapper.trigger('click')
    expect(wrapper.emitted('react')).toBeTruthy()
    wrapper.unmount()
  })

  it('applies the reduced-motion class', () => {
    const wrapper = mount(BiscuitMascot, { props: { mood: 'paused', reducedMotion: true } })
    expect(wrapper.classes()).toContain('mascot--reduced')
    expect(wrapper.classes()).toContain('mascot--paused')
    wrapper.unmount()
  })

  it('draws the scalloped ring (20 edge bumps) and docking dots', () => {
    const wrapper = mount(BiscuitMascot, { props: { mood: 'idle' } })
    // top/bottom 6 + sides 4 each = 20 bump circles, plus docking dots.
    expect(wrapper.findAll('.mascot__shape circle').length).toBeGreaterThanOrEqual(20)
    wrapper.unmount()
  })

  it('applies the current act class for awake moods, but not while paused', () => {
    const busy = mount(BiscuitMascot, { props: { mood: 'busy', act: 'dip' } })
    expect(busy.classes()).toContain('mascot--act-dip')
    busy.unmount()

    // Paused owns a dedicated animation — no act class rides along.
    const paused = mount(BiscuitMascot, { props: { mood: 'paused', act: 'dip' } })
    expect(paused.classes().some((c) => c.startsWith('mascot--act-'))).toBe(false)
    paused.unmount()
  })
})
