import type { AgentRole } from '@shared/types/langgraph'

/** Display names for agent roles in the panel (match roles.ts displayName). */
export const AGENT_ROLE_NAMES: Record<AgentRole, string> = {
  explorer: 'Explorer',
  researcher: 'Researcher',
  drafter: 'Drafter',
  auditor: 'Continuity auditor',
  'line-editor': 'Line editor',
  plotter: 'Plotter'
}
