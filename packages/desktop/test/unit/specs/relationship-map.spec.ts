/**
 * RelationshipMap — deterministic mermaid graph from the fact ledger
 * (SOTA batch-2). Pins the pure projection; the tool round-trip is in
 * story-facts.spec.
 */

import { describe, it, expect } from 'vitest'
import {
  buildRelationshipMermaid,
  buildRelationshipDoc
} from '../../../src/main/services/novel/RelationshipMap'

const entities = [
  { name: 'Zara Voss', aliases: ['Zara', 'Detective Voss'] },
  { name: 'Finn Mercer', aliases: ['Finn'] },
  { name: 'Mara Voss', aliases: ['Mara'] }
]

describe('buildRelationshipMermaid', () => {
  it('draws an edge only when BOTH endpoints are known entities', () => {
    const facts = [
      { subject: 'Zara', relation: 'sister of', object: 'Mara' },
      { subject: 'Finn', relation: 'partner of', object: 'Detective Voss' },
      // Attribute fact — object is not an entity → skipped.
      { subject: 'Zara', relation: 'eye color', object: 'grey' }
    ]
    const graph = buildRelationshipMermaid(facts, entities)
    expect(graph).toContain('graph LR')
    expect(graph).toContain('sister of')
    expect(graph).toContain('partner of')
    // The attribute fact never became an edge.
    expect(graph).not.toContain('eye color')
    expect(graph).not.toContain('grey')
    // Canonical names are used as node labels (alias resolved).
    expect(graph).toContain('Zara Voss')
    expect(graph).toContain('Mara Voss')
    expect(graph).toContain('Finn Mercer')
  })

  it('resolves aliases on both subject and object to canonical entities', () => {
    const graph = buildRelationshipMermaid(
      [{ subject: 'Detective Voss', relation: 'distrusts', object: 'Finn' }],
      entities
    )
    // Two distinct nodes (Zara Voss, Finn Mercer), one edge.
    expect((graph.match(/-->/g) ?? []).length).toBe(1)
    expect(graph).toContain('Zara Voss')
    expect(graph).toContain('Finn Mercer')
  })

  it('dedups identical triples and skips self-loops', () => {
    const facts = [
      { subject: 'Zara', relation: 'sister of', object: 'Mara' },
      { subject: 'Zara', relation: 'sister of', object: 'Mara' },
      { subject: 'Zara', relation: 'same as', object: 'Detective Voss' } // self-loop
    ]
    const graph = buildRelationshipMermaid(facts, entities)
    expect((graph.match(/-->/g) ?? []).length).toBe(1)
  })

  it('returns empty when no fact connects two entities', () => {
    const facts = [{ subject: 'Zara', relation: 'eye color', object: 'grey' }]
    expect(buildRelationshipMermaid(facts, entities)).toBe('')
  })

  it('sanitizes quotes/newlines in labels so mermaid stays valid', () => {
    const graph = buildRelationshipMermaid(
      [{ subject: 'Zara', relation: 'says "hi"\nto', object: 'Finn' }],
      entities
    )
    // No stray quote survives, and the relation label is a single line.
    expect(graph).not.toContain('"hi"')
    const edgeLine = graph.split('\n').find((l) => l.includes('-->'))!
    expect(edgeLine).toContain('says')
    expect(edgeLine).toContain('to')
    expect(edgeLine).not.toContain('"')
  })

  it('strips mermaid delimiters (| and []) from relation labels', () => {
    // `-->|label|` and `id[text]`: a relation carrying either character
    // would break the graph the writer sees rendered.
    const graph = buildRelationshipMermaid(
      [{ subject: 'Zara', relation: 'ally|rival [uneasy]', object: 'Finn' }],
      entities
    )
    const edgeLine = graph.split('\n').find((l) => l.includes('-->'))!
    // Exactly the two pipes that delimit the label — none from the text.
    expect((edgeLine.match(/\|/g) ?? []).length).toBe(2)
    expect(edgeLine).not.toContain('[')
    expect(edgeLine).not.toContain(']')
    expect(edgeLine).toContain('ally')
  })
})

describe('buildRelationshipDoc', () => {
  it('wraps the graph in a titled mermaid fence', () => {
    const doc = buildRelationshipDoc(
      [{ subject: 'Zara', relation: 'sister of', object: 'Mara' }],
      entities
    )
    expect(doc).toContain('# Relationship map')
    expect(doc).toContain('```mermaid')
    expect(doc).toContain('graph LR')
    expect(doc.trimEnd().endsWith('```')).toBe(true)
  })

  it('is empty when there are no relationships', () => {
    expect(buildRelationshipDoc([], entities)).toBe('')
  })
})
