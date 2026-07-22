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

import { escapeRegExp } from './markdownText'

/** One definition of "a word" for every prose metric in this file. */
const WORD_RE = /[A-Za-z’']+/g

const wordsOf = (text: string): string[] => text.match(WORD_RE) ?? []

/**
 * Split prose into sentences (newlines are not sentence breaks — a line
 * wrap mid-sentence must not inflate the count). Shared by the single-unit
 * lint and the corpus lint so their rhythm stats cannot drift apart.
 */
const sentencesOf = (text: string): string[] =>
  text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[A-Za-z]/.test(sentence))

/** Word counts per sentence — the input to every rhythm/monotony check. */
const sentenceWordLengths = (text: string): number[] =>
  sentencesOf(text).map((sentence) => wordsOf(sentence).length)

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
 * HTML comments in a style page are GUIDANCE FOR THE WRITER, never canon:
 * the scaffold keeps its examples there precisely so no reader — model or
 * parser — mistakes them for the writer's own choices.
 */
export const stripHtmlComments = (markdown: string): string =>
  markdown.replace(/<!--[\s\S]*?-->/g, '')

/**
 * Style-page fields the writer has left blank — a bullet whose label ends
 * in `:` with nothing after it (`- Tense:`). An untouched scaffold reports
 * every field, which is what ProjectHealth's `style-unfilled` check
 * surfaces: blank fields mean the drafters fall back to the model default
 * voice, the reason unrelated projects read alike.
 */
export const unfilledStyleFields = (styleMarkdown: string): string[] =>
  stripHtmlComments(styleMarkdown)
    .split('\n')
    .map((line) => /^\s*[-*]\s+([^:]+):\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].trim())

/**
 * Parse banned/avoid terms from a style page: bullet items under a
 * heading containing "banned"/"avoid", plus inline `avoid:`/`banned:`
 * lines (comma-separated). Tolerant — malformed pages yield [].
 */
export const parseBannedTerms = (styleMarkdown: string): string[] => {
  const terms: string[] = []
  const lines = stripHtmlComments(styleMarkdown).split('\n')
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
  const words = wordsOf(text)
  const sentences = sentencesOf(text)
  const sentenceLengths = sentences.map((sentence) => wordsOf(sentence).length)
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
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi')
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

// ---- Corpus (anti-slop) lint --------------------------------------------------
// SOTA audit feature 3: AI prose "slop" is a CROSS-SCENE signal — a pet
// phrase or scene-opening the model reuses across chapters, or a rhythm
// so uniform it reads as machine-generated. lintProse sees one scene;
// lintCorpus sees the whole manuscript and flags what only shows up in
// aggregate. Pure (no fs/LLM) so the book-run critic gate is deterministic.

export interface CorpusUnit {
  /** Display id/title for the finding (scene title or path). */
  label: string
  text: string
}

export interface CorpusFinding {
  type: 'cross-scene-echo' | 'repeated-opening' | 'corpus-rhythm-uniformity'
  message: string
  /** Labels of the units the signal spans. */
  units: string[]
  count?: number
}

export interface CorpusLintResult {
  unitCount: number
  findings: CorpusFinding[]
}

/** How many distinct scenes must share a phrase before it reads as echo. */
const ECHO_MIN_UNITS = 3
/** Phrase length (in words) compared across scenes. */
const ECHO_NGRAM = 4
/** Leading words of a scene compared when hunting repeated openings. */
const OPENING_WORDS = 5

const contentTokens = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z’']+/g) ?? []).filter((w) => w.length > 1)

const ngramsOf = (tokens: string[], n: number): string[] => {
  const out: string[] = []
  for (let i = 0; i + n <= tokens.length; i += 1) {
    const gram = tokens.slice(i, i + n)
    // Skip all-stopword grams (structural, not stylistic).
    if (gram.every((w) => STOPWORDS.has(w))) continue
    out.push(gram.join(' '))
  }
  return out
}

export const lintCorpus = (units: CorpusUnit[]): CorpusLintResult => {
  const findings: CorpusFinding[] = []
  const real = units.filter((u) => /[a-z]/i.test(u.text))
  if (real.length < 2) return { unitCount: real.length, findings }

  // ---- cross-scene echo: distinctive 4-grams spanning ≥3 scenes ----
  const gramUnits = new Map<string, Set<string>>()
  for (const unit of real) {
    const grams = new Set(ngramsOf(contentTokens(unit.text), ECHO_NGRAM))
    for (const gram of grams) {
      const set = gramUnits.get(gram) ?? new Set<string>()
      set.add(unit.label)
      gramUnits.set(gram, set)
    }
  }
  const echoes = [...gramUnits.entries()]
    .filter(([, set]) => set.size >= ECHO_MIN_UNITS)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 12)
  for (const [gram, set] of echoes) {
    findings.push({
      type: 'cross-scene-echo',
      message: `"${gram}" recurs across ${set.size} scenes — a signature phrase or AI echo; vary it`,
      units: [...set].slice(0, 8),
      count: set.size
    })
  }

  // ---- repeated scene openings ----
  const openings = new Map<string, string[]>()
  for (const unit of real) {
    const opener = contentTokens(unit.text).slice(0, OPENING_WORDS).join(' ')
    if (!opener) continue
    const list = openings.get(opener) ?? []
    list.push(unit.label)
    openings.set(opener, list)
  }
  for (const [opener, labels] of openings) {
    if (labels.length >= 2) {
      findings.push({
        type: 'repeated-opening',
        message: `${labels.length} scenes open on the same beat ("${opener}…") — openings should vary`,
        units: labels.slice(0, 8),
        count: labels.length
      })
    }
  }

  // ---- corpus-wide rhythm uniformity ----
  const allLengths: number[] = []
  for (const unit of real) {
    allLengths.push(...sentenceWordLengths(unit.text).filter((length) => length > 0))
  }
  if (allLengths.length >= 40) {
    const mean = allLengths.reduce((a, b) => a + b, 0) / allLengths.length
    const sd = Math.sqrt(
      allLengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / allLengths.length
    )
    const cv = mean > 0 ? sd / mean : 1
    // Human fiction typically varies sentence length a lot (CV ~0.5–0.8);
    // a very low CV across the whole book reads as machine-flat.
    if (cv < 0.35 && mean > 6) {
      findings.push({
        type: 'corpus-rhythm-uniformity',
        message:
          `Sentence lengths barely vary across the manuscript (avg ${Math.round(mean)} words, ` +
          `variation ${Math.round(cv * 100)}% of mean) — vary short punchy lines against longer ones`,
        units: real.map((u) => u.label).slice(0, 8)
      })
    }
  }

  return { unitCount: real.length, findings }
}
