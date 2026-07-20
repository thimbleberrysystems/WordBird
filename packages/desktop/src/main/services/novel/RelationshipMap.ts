/**
 * RelationshipMap — a deterministic mermaid graph of who-relates-to-whom,
 * derived from the typed fact ledger (SOTA audit batch-2). Campfire/World
 * Anvil ship relationship maps; WordBird already has the substrate (the
 * subject–relation–object fact ledger + the entity index), and muya
 * renders ```mermaid fences natively — so the map is just a projection.
 *
 * Only INTER-ENTITY facts become edges: both the subject and the object
 * must be known bible entities (a character/place page or one of its
 * aliases). Attribute facts like "Zara / eye color / grey" have a
 * non-entity object and are skipped — this is a relationship graph, not
 * an attribute dump. Pure: no fs, no LLM.
 */

interface FactTriple {
  subject: string
  relation: string
  object: string
}

interface EntityLike {
  name: string
  aliases: string[]
}

/** Mermaid node ids must be simple identifiers; map each entity to a
 * stable `n<index>` and remember its display name. */
// `|` delimits an edge label (`-->|label|`) and `[]` delimit node text, so a
// relation containing either would produce an unparseable graph.
const sanitizeLabel = (text: string): string => text.replace(/["|[\]\n]/g, ' ').trim()

/**
 * Build a `mermaid graph LR` of inter-entity relationships, or '' when
 * no fact connects two known entities.
 */
export const buildRelationshipMermaid = (
  facts: FactTriple[],
  entities: EntityLike[]
): string => {
  // Resolve any name/alias (case-insensitive) to its canonical entity name.
  const canonical = new Map<string, string>()
  for (const entity of entities) {
    canonical.set(entity.name.toLowerCase(), entity.name)
    for (const alias of entity.aliases) canonical.set(alias.toLowerCase(), entity.name)
  }
  const resolve = (term: string): string | null => canonical.get(term.trim().toLowerCase()) ?? null

  const nodeId = new Map<string, string>()
  const idFor = (name: string): string => {
    if (!nodeId.has(name)) nodeId.set(name, `n${nodeId.size}`)
    return nodeId.get(name) as string
  }

  const edges: string[] = []
  const seen = new Set<string>()
  for (const fact of facts) {
    const s = resolve(fact.subject)
    const o = resolve(fact.object)
    if (!s || !o || s === o) continue
    const key = `${s}|${fact.relation}|${o}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push(`  ${idFor(s)} -->|${sanitizeLabel(fact.relation)}| ${idFor(o)}`)
  }
  if (edges.length === 0) return ''

  const nodes = [...nodeId.entries()].map(([name, id]) => `  ${id}["${sanitizeLabel(name)}"]`)
  return ['graph LR', ...nodes, ...edges].join('\n')
}

/** The full bible/relationships.md document (mermaid fenced), or '' when
 * there are no inter-entity relationships yet. */
export const buildRelationshipDoc = (facts: FactTriple[], entities: EntityLike[]): string => {
  const graph = buildRelationshipMermaid(facts, entities)
  if (!graph) return ''
  return (
    '# Relationship map\n\n' +
    'Auto-generated from the fact ledger (record_fact). Edit the ledger, not this file — ' +
    'regenerate with relationship_map.\n\n' +
    '```mermaid\n' +
    graph +
    '\n```\n'
  )
}
