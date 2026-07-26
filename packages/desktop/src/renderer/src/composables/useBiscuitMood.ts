/**
 * Biscuit mascot mood — the little state machine behind the animated
 * character in the Biscuit panel.
 *
 * Pure UI state (matches the useBiscuitUsage / useConversationHistory
 * composable pattern): derives a `mood` from the run flags, cycles through a
 * repertoire of ACTS (drift / dip-in-coffee / sway / half-bitten / spin /
 * crumble / snap-in-half) so Biscuit keeps doing DIFFERENT things, rotates a
 * caption, honours prefers-reduced-motion, and exposes `poke()` for the click
 * reaction. NO dependency on the activity feed — the "what is Biscuit doing"
 * detail is the Agents tab's job; this is companionship, not status.
 *
 * Timing is deliberately NON-uniform: each act has its own dwell time (a slow
 * drift lingers, a quick gag passes), the way an old screensaver held one
 * module for a while before drifting to the next — never a fixed metronome.
 */

import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { t } from '../i18n'

export type BiscuitMood = 'idle' | 'busy' | 'longwait' | 'paused' | 'react' | 'celebrate'

/** After this long in a busy run, Biscuit shifts to the "still here!" mood so
 * a long wait feels acknowledged rather than frozen. */
export const LONGWAIT_MS = 25_000
/** How long a click reaction (nibble + quip) holds before reverting. */
export const REACT_MS = 1_500
/** A brief happy hop when a run finishes, before the mascot bows out. */
export const CELEBRATE_MS = 1_200

/** One move in Biscuit's repertoire + how long it lingers before the next. */
export interface BiscuitAct {
  name: string
  /** Dwell time in ms — deliberately per-act, never uniform. */
  hold: number
}

/** The repertoire, in order. `name` maps to a `mascot--act-<name>` class in
 * BiscuitMascot.vue. Dwell times vary so the cadence never feels metronomic. */
export const ACTS: BiscuitAct[] = [
  // motion
  { name: 'drift', hold: 8_000 },
  { name: 'sway', hold: 5_000 },
  { name: 'spin', hold: 4_500 },
  { name: 'tumble', hold: 5_000 },
  { name: 'jelly', hold: 4_000 },
  { name: 'puff', hold: 4_000 },
  { name: 'faint', hold: 5_500 },
  { name: 'dizzy', hold: 5_000 },
  // tea-time
  { name: 'dip', hold: 7_000 },
  { name: 'milk', hold: 6_500 },
  { name: 'tea', hold: 6_500 },
  { name: 'bite', hold: 5_500 },
  { name: 'nibble', hold: 6_000 },
  { name: 'sugar', hold: 5_500 },
  { name: 'icing', hold: 6_000 },
  // bakery
  { name: 'baked', hold: 6_000 },
  { name: 'toast', hold: 6_000 },
  { name: 'stamp', hold: 4_500 },
  // destruction
  { name: 'crumble', hold: 5_000 },
  { name: 'break', hold: 6_000 },
  { name: 'mitosis', hold: 6_000 },
  // emotions
  { name: 'wink', hold: 4_000 },
  { name: 'love', hold: 5_500 },
  { name: 'nervous', hold: 5_000 },
  { name: 'proud', hold: 5_000 },
  { name: 'idea', hold: 5_000 },
  // writing companion
  { name: 'scribble', hold: 7_000 },
  { name: 'read', hold: 7_000 },
  { name: 'spell', hold: 6_000 }
]

// Caption pools as i18n KEYS, resolved through t() at read time so they follow
// the app language. Objects with numeric keys in en.json → dotted access works
// with the custom t() wrapper. Rotation is index-based so tests can assert the
// selection without coupling to the resolved strings.
const BUSY_KEYS = [
  'biscuit.mascot.busy.0',
  'biscuit.mascot.busy.1',
  'biscuit.mascot.busy.2',
  'biscuit.mascot.busy.3'
]
const LONGWAIT_KEYS = [
  'biscuit.mascot.longwait.0',
  'biscuit.mascot.longwait.1',
  'biscuit.mascot.longwait.2'
]
const QUIP_KEYS = [
  'biscuit.mascot.quips.0',
  'biscuit.mascot.quips.1',
  'biscuit.mascot.quips.2',
  'biscuit.mascot.quips.3'
]

export interface BiscuitMoodApi {
  mood: ComputedRef<BiscuitMood>
  caption: ComputedRef<string>
  /** Index of the current act in ACTS (frozen under reduced motion). */
  act: Ref<number>
  /** Name of the current act — the component maps it to an animation class. */
  actName: ComputedRef<string>
  reducedMotion: Ref<boolean>
  poke: () => void
  /** Test seam: advance the internal clock/rotation by one 1s tick. */
  _tick: () => void
}

export const useBiscuitMood = (options: {
  sending: Ref<boolean>
  runState: Ref<'idle' | 'running' | 'paused'>
  connected: Ref<boolean>
}): BiscuitMoodApi => {
  const { sending, runState } = options

  // The internal clock — advanced once a second while mounted so mood timing
  // (longwait / react / celebrate expiry) and the act/caption cycles run.
  const now = ref(Date.now())
  const busySince = ref(0)
  const reactUntil = ref(0)
  const celebrateUntil = ref(0)
  const rotateIndex = ref(0)
  const quipIndex = ref(0)
  const act = ref(0)
  let actStartedAt = Date.now()

  // prefers-reduced-motion: freeze the cycling (the component freezes the CSS).
  const reducedMotion = ref(false)
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = mql.matches
    mql.addEventListener?.('change', (e) => {
      reducedMotion.value = e.matches
    })
  }

  // Track when the current busy run started (drives the longwait threshold),
  // and fire a brief celebration when a real run finishes (true → false).
  watch(
    sending,
    (on, was) => {
      if (on) {
        busySince.value = Date.now()
      } else {
        busySince.value = 0
        if (was) celebrateUntil.value = Date.now() + CELEBRATE_MS
      }
    },
    { immediate: true }
  )

  const mood = computed<BiscuitMood>(() => {
    if (reactUntil.value > now.value) return 'react'
    if (!sending.value) {
      return celebrateUntil.value > now.value ? 'celebrate' : 'idle'
    }
    if (runState.value === 'paused') return 'paused'
    if (busySince.value && now.value - busySince.value >= LONGWAIT_MS) return 'longwait'
    return 'busy'
  })

  const actName = computed(() => ACTS[act.value % ACTS.length].name)

  const caption = computed(() => {
    switch (mood.value) {
      case 'react':
        return t(QUIP_KEYS[quipIndex.value % QUIP_KEYS.length])
      case 'longwait':
        return t(LONGWAIT_KEYS[rotateIndex.value % LONGWAIT_KEYS.length])
      case 'busy':
        return t(BUSY_KEYS[rotateIndex.value % BUSY_KEYS.length])
      case 'paused':
        return t('biscuit.pausedNote')
      default:
        return ''
    }
  })

  const poke = (): void => {
    quipIndex.value = Math.floor(Math.random() * QUIP_KEYS.length)
    reactUntil.value = Date.now() + REACT_MS
  }

  // A single 1s ticker advances the clock and, once the current act has held
  // for its own dwell time, drifts to the next act. The caption turns over IN
  // STEP with the act (same moment, same beat) so the text and the animation
  // change together rather than on separate clocks. Runs the whole time the
  // panel is mounted so Biscuit stays lively even on the welcome card; reduced
  // motion freezes the visible cycling but the clock still advances so mood
  // timing keeps working.
  const _tick = (): void => {
    now.value = Date.now()
    if (reducedMotion.value) return
    if (now.value - actStartedAt >= ACTS[act.value % ACTS.length].hold) {
      act.value = (act.value + 1) % ACTS.length
      actStartedAt = now.value
      rotateIndex.value += 1
    }
  }
  const timer = setInterval(_tick, 1000)
  onUnmounted(() => clearInterval(timer))

  return { mood, caption, act, actName, reducedMotion, poke, _tick }
}
