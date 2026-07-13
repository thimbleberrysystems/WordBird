/**
 * ProseLint — deterministic prose checks (proselint/Vale-inspired), the
 * novel-writing equivalent of "run the linter after the edit" that coding
 * agents rely on. Pure functions: no fs, no LLM — every finding is
 * mechanically reproducible, so agents can verify their own drafts and
 * critics get an objective signal.
 *
 * Findings are SIGNALS for the writer/agents to weigh, never laws — the
 * flexibility prime directive applies (a stylistic repetition can be a
 * deliberate device).
 */

export interface ProseLintFinding {
  /** Check id, kebab-case (doubled-word, filler-word, banned-term, …). */
  type: string
  message: string
  /** Short excerpt around the hit. */
  sample?: string
  count?: number
}

export interface ProseLintStats {
  words: number
  sentences: number
  avgSentenceWords: number
  longestSentenceWords: number
  longSentencePct: number
  adverbsPer1000: number
}

export interface ProseLintResult {
  stats: ProseLintStats
  findings: ProseLintFinding[]
}

/** Common filler/crutch words that weaken fiction prose. */
const FILLER_WORDS = [
  'very', 'really', 'just', 'quite', 'rather', 'somewhat', 'suddenly',
  'somehow', 'actually', 'basically', 'literally', 'definitely'
]

/** Filter-verb phrases that distance the reader from the POV character. */
const FILTER_PHRASES = [
  'began to', 'started to', 'seemed to', 'felt like', 'she felt', 'he felt',
  'she saw', 'he saw', 'she heard', 'he heard', 'she noticed', 'he noticed',
  'she realized', 'he realized', 'she watched', 'he watched'
]

/** Words too common to flag as near-repeats. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'as',
  'is', 'was', 'were', 'are', 'be', 'been', 'it', 'its', 'he', 'she', 'they',
  'his', 'her', 'their', 'them', 'him', 'i', 'you', 'we', 'that', 'this',
  'with', 'for', 'from', 'by', 'had', 'have', 'has', 'not', 'no', 'so',
  'said', 'up', 'down', 'out', 'into', 'over', 'then', 'than', 'there',
  'what', 'when', 'where', 'who', 'all', 'one', 'like', 'my', 'me', 'your'
])

const NEAR_REPEAT_WINDOW = 15

const excerpt = (text: string, index: number, span = 60): string => {
  const start = Math.max(0, index - span / 2)
  return (
    (start > 0 ? '…' : '') +
    text.slice(start, index + span).replace(/\s+/g, ' ').trim() +
    '…'
  )
}

/**
 * Parse banned/avoid terms from a style page: bullet items under a
 * heading containing "banned"/"avoid", plus inline `avoid:`/`banned:`
 * lines (comma-separated). Tolerant — malformed pages yield [].
 */
export const parseBannedTerms = (styleMarkdown: string): string[] => {
  const terms: string[] = []
  const lines = styleMarkdown.split('\n')
  let inBannedSection = false
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      inBannedSection = /banned|avoid/i.test(heading[1])
      continue
    }
    const inline = /^\s*[-*]?\s*(?:banned|avoid)\s*:\s*(.+)$/i.exec(line)
    if (inline) {
      terms.push(...inline[1].split(',').map((t) => t.trim()).filter(Boolean))
      continue
    }
    if (inBannedSection) {
      const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line)
      if (bullet) {
        terms.push(bullet[1].replace(/^["'`]|["'`]$/g, '').trim())
      } else if (line.trim() === '') {
        // blank lines are fine inside the section
      } else if (!/^\s/.test(line) && line.trim()) {
        inBannedSection = false
      }
    }
  }
  return [...new Set(terms.map((t) => t.toLowerCase()).filter((t) => t.length > 1))]
}

export const lintProse = (
  text: string,
  options: { bannedTerms?: string[] } = {}
): ProseLintResult => {
  const findings: ProseLintFinding[] = []
  const lower = text.toLowerCase()

  // ---- token + sentence stats ----
  const words = text.match(/[A-Za-z’']+/g) ?? []
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s))
  const sentenceLengths = sentences.map((s) => (s.match(/[A-Za-z’']+/g) ?? []).length)
  const totalWords = words.length
  const avg =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
      : 0
  const longest = sentenceLengths.length > 0 ? Math.max(...sentenceLengths) : 0
  const longCount = sentenceLengths.filter((l) => l > 40).length
  const adverbs = words.filter((w) => /ly$/i.test(w) && w.length > 4).length
  const adverbsPer1000 = totalWords > 0 ? Math.round((adverbs / totalWords) * 1000) : 0

  const stats: ProseLintStats = {
    words: totalWords,
    sentences: sentences.length,
    avgSentenceWords: Math.round(avg * 10) / 10,
    longestSentenceWords: longest,
    longSentencePct:
      sentenceLengths.length > 0 ? Math.round((longCount / sentenceLengths.length) * 100) : 0,
    adverbsPer1000
  }

  // ---- doubled words ("the the") ----
  const doubled = /\b([A-Za-z’']+)\s+\1\b/gi
  let m: RegExpExecArray | null
  while ((m = doubled.exec(text)) !== null) {
    findings.push({
      type: 'doubled-word',
      message: `Doubled word "${m[1]}"`,
      sample: excerpt(text, m.index)
    })
  }

  // ---- non-stopword repeated within a short window ----
  const tokenRe = /[A-Za-z’']+/g
  const recent: Array<{ word: string; index: number; pos: number }> = []
  let tok: RegExpExecArray | null
  let pos = 0
  const nearRepeats = new Map<string, { count: number; sample: string }>()
  while ((tok = tokenRe.exec(text)) !== null) {
    pos += 1
    const word = tok[0].toLowerCase()
    if (word.length < 4 || STOPWORDS.has(word)) continue
    const prior = recent.find((r) => r.word === word && pos - r.pos <= NEAR_REPEAT_WINDOW)
    if (prior) {
      const entry = nearRepeats.get(word) ?? { count: 0, sample: excerpt(text, tok.index) }
      entry.count += 1
      nearRepeats.set(word, entry)
    }
    recent.push({ word, index: tok.index, pos })
    if (recent.length > NEAR_REPEAT_WINDOW * 2) recent.shift()
  }
  for (const [word, info] of nearRepeats) {
    findings.push({
      type: 'near-repeat',
      message: `"${word}" repeats within ${NEAR_REPEAT_WINDOW} words`,
      sample: info.sample,
      count: info.count + 1
    })
  }

  // ---- filler/crutch words ----
  for (const filler of FILLER_WORDS) {
    const re = new RegExp(`\\b${filler}\\b`, 'gi')
    const hits = lower.match(re)?.length ?? 0
    // Tolerate occasional use; flag density.
    if (hits >= 3 || (totalWords < 300 && hits >= 2)) {
      findings.push({
        type: 'filler-word',
        message: `"${filler}" appears ${hits}×`,
        count: hits
      })
    }
  }

  // ---- POV filter phrases ----
  for (const phrase of FILTER_PHRASES) {
    const at = lower.indexOf(phrase)
    if (at !== -1) {
      const hits = lower.split(phrase).length - 1
      findings.push({
        type: 'filter-phrase',
        message: `Filtering phrase "${phrase}" (${hits}×) — consider showing the perception directly`,
        sample: excerpt(text, at),
        count: hits
      })
    }
  }

  // ---- passive-voice heuristic ----
  const passive = lower.match(/\b(?:was|were|been|being)\s+\w+ed\b/g) ?? []
  if (sentences.length > 0 && passive.length / sentences.length > 0.15) {
    findings.push({
      type: 'passive-voice',
      message: `Passive constructions in roughly ${Math.round((passive.length / sentences.length) * 100)}% of sentences`,
      count: passive.length
    })
  }

  // ---- adverb density ----
  if (adverbsPer1000 > 25 && totalWords >= 200) {
    findings.push({
      type: 'adverb-density',
      message: `-ly adverb density is ${adverbsPer1000}/1000 words (heavy; strong verbs usually read better)`
    })
  }

  // ---- sentence monotony ----
  if (sentenceLengths.length >= 10) {
    const variance =
      sentenceLengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / sentenceLengths.length
    if (Math.sqrt(variance) < 3 && avg > 6) {
      findings.push({
        type: 'sentence-monotony',
        message:
          `Sentence lengths barely vary (avg ${stats.avgSentenceWords} words) — ` +
          'rhythm may feel flat'
      })
    }
  }

  // ---- hygiene ----
  const doubleSpaceAt = text.search(/[^\n ] {2,}[^\n ]/)
  if (doubleSpaceAt !== -1) {
    findings.push({
      type: 'double-space',
      message: 'Double spaces found',
      sample: excerpt(text, doubleSpaceAt)
    })
  }
  const straight = (text.match(/["']/g) ?? []).length
  const curly = (text.match(/[“”‘’]/g) ?? []).length
  if (straight > 0 && curly > 0) {
    findings.push({
      type: 'mixed-quotes',
      message: `Straight (${straight}) and curly (${curly}) quotes are mixed`
    })
  }
  const doubleQuoteCount = (text.match(/["“”]/g) ?? []).length
  if (doubleQuoteCount % 2 === 1) {
    findings.push({
      type: 'unbalanced-quotes',
      message: 'Odd number of double-quote marks — a quotation may be unclosed'
    })
  }

  // ---- banned terms from style.md ----
  for (const term of options.bannedTerms ?? []) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    const match = re.exec(text)
    if (match) {
      const hits = text.match(re)?.length ?? 1
      findings.push({
        type: 'banned-term',
        message: `Banned term (bible/style.md) "${term}" appears ${hits}×`,
        sample: excerpt(text, match.index),
        count: hits
      })
    }
  }

  return { stats, findings }
}
