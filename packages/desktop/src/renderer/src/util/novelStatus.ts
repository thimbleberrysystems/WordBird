/**
 * Scene status cycling — the status dot is a CONTROL, not decoration:
 * one click advances idea → draft → revised → final → idea, everywhere
 * a dot renders (binder, corkboard, timeline).
 */

import type { NovelUnitStatus } from '@shared/types/novel'

export const STATUS_CYCLE: NovelUnitStatus[] = ['idea', 'draft', 'revised', 'final']

export const nextStatus = (current?: string | null): NovelUnitStatus => {
  // Unknown/missing values behave as 'idea' so the first click always
  // advances to 'draft' instead of resetting.
  const index = Math.max(0, STATUS_CYCLE.indexOf((current ?? 'idea') as NovelUnitStatus))
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length]
}
