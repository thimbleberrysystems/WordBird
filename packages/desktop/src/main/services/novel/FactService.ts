/**
 * FactService — the typed story-fact ledger (v1 of the "world state graph"
 * the strongest long-form research systems use for inconsistency
 * detection).
 *
 * Facts are subject–relation–object triples with a source scene:
 *   { subject: "Zara Voss", relation: "eye color", object: "grey",
 *     sourceUnitId: "…", note: "established in the alley scene" }
 *
 * Agents record durable canon as they draft (aftercare) and auditors check
 * new prose against the ledger — a scene that gives Zara green eyes is a
 * lookup away from being caught, no re-reading required. Stored at
 * `.wordbird/continuity/facts.json` beside the issue tracker.
 */

import path from 'path'
import fsPromises from 'fs/promises'
import crypto from 'crypto'

export interface IStoryFact {
  id: string
  subject: string
  relation: string
  object: string
  /** Unit where this fact was established (evidence trail). */
  sourceUnitId?: string
  note?: string
  at: number
}

const factsPath = (root: string): string =>
  path.join(root, '.wordbird', 'continuity', 'facts.json')

export class FactService {
  async list(root: string, about?: string): Promise<IStoryFact[]> {
    let facts: IStoryFact[] = []
    try {
      const raw = JSON.parse(await fsPromises.readFile(factsPath(root), 'utf8')) as {
        facts?: IStoryFact[]
      }
      if (Array.isArray(raw.facts)) facts = raw.facts
    } catch {
      // No ledger yet.
    }
    if (!about) return facts
    const wanted = about.trim().toLowerCase()
    return facts.filter(
      (fact) =>
        fact.subject.toLowerCase().includes(wanted) ||
        fact.object.toLowerCase().includes(wanted) ||
        fact.relation.toLowerCase().includes(wanted)
    )
  }

  async record(
    root: string,
    fact: Omit<IStoryFact, 'id' | 'at'>
  ): Promise<{ fact: IStoryFact; duplicate: boolean }> {
    const facts = await this.list(root)
    const same = (a: string, b: string): boolean =>
      a.trim().toLowerCase() === b.trim().toLowerCase()
    const existing = facts.find(
      (f) =>
        same(f.subject, fact.subject) &&
        same(f.relation, fact.relation) &&
        same(f.object, fact.object)
    )
    if (existing) return { fact: existing, duplicate: true }

    const entry: IStoryFact = { id: crypto.randomUUID(), at: Date.now(), ...fact }
    facts.push(entry)
    await fsPromises.mkdir(path.dirname(factsPath(root)), { recursive: true })
    await fsPromises.writeFile(factsPath(root), JSON.stringify({ facts }, null, 2), 'utf8')
    return { fact: entry, duplicate: false }
  }

  async count(root: string): Promise<number> {
    return (await this.list(root)).length
  }
}

export const factService = new FactService()
