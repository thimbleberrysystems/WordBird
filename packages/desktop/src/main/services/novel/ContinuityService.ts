/**
 * ContinuityService — persistence for the continuity inspector.
 * Issues live in `.wordbird/continuity/issues.json`, written by the
 * auditor agents (log_continuity_issue) and resolved by the writer.
 */

import path from 'path'
import fsPromises from 'fs/promises'
import type { IContinuityIssue } from '../../../shared/types/novel'

const issuesPath = (root: string): string =>
  path.join(root, '.wordbird', 'continuity', 'issues.json')

export class ContinuityService {
  async list(root: string): Promise<IContinuityIssue[]> {
    try {
      const raw = await fsPromises.readFile(issuesPath(root), 'utf8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as IContinuityIssue[]) : []
    } catch {
      return []
    }
  }

  async save(root: string, issues: IContinuityIssue[]): Promise<void> {
    const target = issuesPath(root)
    await fsPromises.mkdir(path.dirname(target), { recursive: true })
    await fsPromises.writeFile(target, JSON.stringify(issues, null, 2), 'utf8')
  }

  async add(root: string, issue: IContinuityIssue): Promise<number> {
    const issues = await this.list(root)
    issues.push(issue)
    await this.save(root, issues)
    return issues.filter((i) => i.status === 'open').length
  }

  async resolve(root: string, issueId: string): Promise<boolean> {
    const issues = await this.list(root)
    const issue = issues.find((i) => i.id === issueId)
    if (!issue) return false
    issue.status = 'resolved'
    await this.save(root, issues)
    return true
  }
}

export const continuityService = new ContinuityService()
