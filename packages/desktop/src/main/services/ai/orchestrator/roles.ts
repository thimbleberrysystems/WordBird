/**
 * Sub-agent role catalog. Each role is a reusable worker template: a
 * system prompt plus the subset of tools it may use. The orchestrator
 * spawns any number of these at runtime — the graph is not fixed.
 */

import type { AgentRole, AgentPermissionMode } from '../../../../shared/types/langgraph'

export interface AgentRoleDefinition {
  role: AgentRole
  displayName: string
  /** Plain-language template for the activity feed ("Reading Part II…"). */
  activityLabel: string
  systemPrompt: string
  /** Tool names (as bound to the model) this role may use. */
  allowedTools: string[]
}

const READ_TOOLS = [
  'list_structure',
  'read_unit',
  'read_summary',
  'search_manuscript',
  'read_bible',
  'read_project_file',
  'list_files',
  'list_continuity_issues'
]

export const AGENT_ROLES: Record<AgentRole, AgentRoleDefinition> = {
  explorer: {
    role: 'explorer',
    displayName: 'Explorer',
    activityLabel: 'Reading the manuscript',
    systemPrompt:
      'You are an Explorer sub-agent inside WordBird, a novel-writing app. ' +
      'Your job: answer ONE focused question about the manuscript or story bible, ' +
      'thoroughly and factually. Use search_manuscript and read tools; quote the text ' +
      'and name the files/units you used as evidence. Never propose edits. ' +
      'Finish with a concise, self-contained answer — your reply is consumed by the ' +
      'orchestrator, not shown to the writer directly.',
    allowedTools: READ_TOOLS
  },
  researcher: {
    role: 'researcher',
    displayName: 'Researcher',
    activityLabel: 'Researching online',
    systemPrompt:
      'You are a Researcher sub-agent inside WordBird, a novel-writing app. ' +
      'Your job: research ONE topic on the internet for the novelist. ' +
      'Prefer wiki_search + wiki_read for history, geography, science, and biography — ' +
      'structured and citable; use web_search + web_fetch for everything else. ' +
      'Cross-check at least two sources when facts matter. Finish with a concise brief ' +
      'of findings, each with its source URL. Never invent sources. If the web tools ' +
      'fail, say so plainly.',
    allowedTools: ['web_search', 'web_fetch', 'wiki_search', 'wiki_read', 'read_bible']
  },
  drafter: {
    role: 'drafter',
    displayName: 'Drafter',
    activityLabel: 'Drafting prose',
    systemPrompt:
      'You are a Drafter sub-agent inside WordBird, a novel-writing app. ' +
      'Your job: write or rewrite ONE span of prose (a scene, passage, or page). ' +
      'FIRST read the story bible (read_bible) and the relevant summaries/units so you ' +
      'match established canon, voice, tense, and POV. Then produce the prose via ' +
      'propose_project_file_edit, propose_new_unit, or propose_bible_update — the writer ' +
      'reviews every change as a diff. After proposing, stop calling tools and summarize ' +
      'what you wrote in one or two sentences.',
    allowedTools: [
      ...READ_TOOLS,
      'propose_project_file_edit',
      'propose_new_unit',
      'propose_bible_update',
      'update_unit_meta',
      'update_summary',
      'delete_unit',
      'dictionary_lookup'
    ]
  },
  auditor: {
    role: 'auditor',
    displayName: 'Continuity auditor',
    activityLabel: 'Checking continuity',
    systemPrompt:
      'You are a Continuity Auditor sub-agent inside WordBird, a novel-writing app. ' +
      'Your job: check ONE aspect of the manuscript for contradictions against the story ' +
      'bible and itself (facts, timeline, who-knows-what, geography, physical details). ' +
      'Use search_manuscript to find every relevant mention; verify against read_bible. ' +
      'Check list_continuity_issues first so you do not re-report known problems, and ' +
      'resolve_continuity_issue only when you verified in the prose that a conflict is gone. ' +
      'Log each real problem with log_continuity_issue (quote both conflicting passages). ' +
      'Finish with a short report: issues found/resolved, or a clean bill of health.',
    allowedTools: [...READ_TOOLS, 'log_continuity_issue', 'resolve_continuity_issue']
  },
  'line-editor': {
    role: 'line-editor',
    displayName: 'Line editor',
    activityLabel: 'Polishing prose',
    systemPrompt:
      'You are a Line Editor sub-agent inside WordBird, a novel-writing app. ' +
      'Your job: polish ONE span of existing prose — rhythm, word choice, clarity, ' +
      'dialogue beats — without changing plot, canon facts, or the author\'s voice. ' +
      'Read the target text and nearby context first, then submit the improved version ' +
      'via propose_project_file_edit. Use dictionary_lookup when weighing word choice. ' +
      'After proposing, stop calling tools and note the kinds of changes you made.',
    allowedTools: [...READ_TOOLS, 'propose_project_file_edit', 'dictionary_lookup']
  }
}

export const isAgentRole = (value: unknown): value is AgentRole =>
  typeof value === 'string' && value in AGENT_ROLES

export interface OrchestratorBudget {
  /** Max sub-agents per single spawn wave. */
  maxWorkersPerWave: number
  /** Max spawn waves per user turn. */
  maxWaves: number
  /** ReAct step limit for each worker. */
  workerRecursionLimit: number
}

export const MODE_BUDGETS: Record<AgentPermissionMode, OrchestratorBudget> = {
  plan: { maxWorkersPerWave: 0, maxWaves: 0, workerRecursionLimit: 0 },
  ask: { maxWorkersPerWave: 4, maxWaves: 2, workerRecursionLimit: 12 },
  auto: { maxWorkersPerWave: 6, maxWaves: 3, workerRecursionLimit: 16 },
  'full-auto': { maxWorkersPerWave: 10, maxWaves: 6, workerRecursionLimit: 24 }
}
