// Event map for the renderer-side mitt bus. Concrete event payloads are
// added as call sites convert to TS in Stage 3/4/5; for now this is a
// permissive map keyed by string with `unknown[]` payloads so we can
// retrofit per-event types incrementally.

import type { IAgentApplyEditRequest } from '@shared/types/langgraph'

export interface BusEvents {
  [key: string]: unknown[]
  'apply-agent-edit': [request: IAgentApplyEditRequest]
}
