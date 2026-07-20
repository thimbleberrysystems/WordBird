/**
 * Writing-goal math (pure) — deadline-driven daily quota (Dabble-style)
 * and target parsing for the binder. Kept out of the component so the
 * arithmetic is unit-testable without mounting Vue.
 */

/** Whole days from `now` (local) to the end of `deadline` (YYYY-MM-DD),
 * minimum 1. null when the deadline is absent or malformed. */
export const daysUntil = (deadline: string, now: number = Date.now()): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null
  const end = new Date(`${deadline}T23:59:59`)
  if (Number.isNaN(end.getTime())) return null
  return Math.max(1, Math.ceil((end.getTime() - now) / 86_400_000))
}

/** Words/day needed to reach `target` from `current` in `daysLeft`.
 * null when there is no positive target/days or the target is already met. */
export const dailyQuota = (
  target: number,
  current: number,
  daysLeft: number | null
): number | null => {
  if (target <= 0 || daysLeft === null || daysLeft <= 0) return null
  const remaining = target - current
  if (remaining <= 0) return null
  return Math.ceil(remaining / daysLeft)
}

/** Parse a target field: "50000" or "50000 by 2026-12-31" → {target, deadline}. */
export const parseTargetInput = (raw: string): { target: number; deadline: string } => {
  const match = /^\s*(\d*)\s*(?:by\s*(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(raw)
  const target = Number(match?.[1]) || 0
  return { target, deadline: target > 0 ? (match?.[2] ?? '') : '' }
}
