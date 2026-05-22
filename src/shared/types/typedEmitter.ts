import { EventEmitter } from 'node:events'

/**
 * EventEmitter subclass with a typed event map. Extend it with an interface
 * mapping event names to listener-argument tuples; `on`/`emit`/etc. are then
 * type-checked at the call site.
 *
 * Used by main-process classes (BaseWindow, WindowManager, DataCenter,
 * Preferences, EditorBufferStore, Keyboard) — see Commit 5d.
 *
 * @example
 *   interface BaseWindowEvents {
 *     ready: []
 *     'window-blur': [id: number]
 *     'will-close': [id: number, opts: { keepInBackground: boolean }]
 *   }
 *   class BaseWindow extends TypedEmitter<BaseWindowEvents> { ... }
 */
export class TypedEmitter<Events extends Record<string, unknown[]>> extends EventEmitter {
  declare on: <K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void
  ) => this

  declare once: <K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void
  ) => this

  declare off: <K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void
  ) => this

  declare emit: <K extends keyof Events & string>(
    event: K,
    ...args: Events[K]
  ) => boolean

  declare removeListener: <K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void
  ) => this

  declare addListener: <K extends keyof Events & string>(
    event: K,
    listener: (...args: Events[K]) => void
  ) => this
}
