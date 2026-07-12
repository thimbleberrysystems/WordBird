/**
 * Book run — the auto-continuation loop that lets Biscuit draft a whole
 * novel from one instruction.
 *
 * The live plan file is the durable work queue: while it has unchecked
 * items the supervisor ends each segment with a final "CONTINUE: <next
 * step>" line and the loop grants another turn — the writer never types
 * "continue". Bounded by safety ceilings (segment count, token spend, a
 * no-progress detector), and resumable: progress lives in plan files +
 * structure.json, so a stop of any kind loses nothing.
 *
 * Pure logic module (no Electron imports) so the loop is unit-testable;
 * LangGraphManager wires the real dependencies.
 */

/**
 * Matches a final "CONTINUE: <reason>" line of the supervisor's reply.
 * Tolerant of markdown emphasis around the protocol line (models love to
 * bold it) — but it must still be the LAST line of the reply.
 */
export const CONTINUE_RE = /(?:^|\n)[ \t*_]*CONTINUE:[ \t]*([^\n]*?)[\s*_]*$/

export const AUTO_CONTINUE_MESSAGE =
  '[AUTO-CONTINUE] The harness granted the next book-run segment. Re-read the live ' +
  'plan, do the next chunk of work, and tick completed items. End with "CONTINUE: …" ' +
  'only if unchecked plan work remains; otherwise wrap up normally.'

export interface BookRunDeps {
  /** Send the AUTO_CONTINUE message; resolve to the reply's extracted text. */
  invokeNext: () => Promise<string>
  /** Auto mode gates the loop — mode can change mid-run. */
  isAuto: () => boolean
  /** Total session tokens (spend guard measures the delta). */
  sessionTokens: () => number
  /** Cheap project fingerprint; two unchanged segments = spinning. */
  progressSignature: () => string
  emitStatus: (label: string, detail?: string) => void
  /** Safety ceiling on segments per run. */
  maxContinuations: number
  /** Safety ceiling on tokens per run. */
  tokenCeiling: number
  /**
   * Ask the writer whether to grant another budget block when a safety
   * ceiling is reached (surfaces as an approval card). Approved → the run
   * resumes with a fresh block; declined/absent → the run pauses.
   */
  requestContinuation?: (reason: string) => Promise<boolean>
  signal?: AbortSignal
}

/**
 * Run continuation segments while the reply carries the CONTINUE marker.
 * Returns the final reply text (marker stripped, stop reason appended).
 * Rethrows aborts so Stop keeps its normal semantics.
 */
export async function driveBookRun(firstContent: string, deps: BookRunDeps): Promise<string> {
  let content = firstContent
  let match = CONTINUE_RE.exec(content)
  if (!match) return content
  // The marker is a protocol line, never prose — strip it in any mode.
  if (!deps.isAuto()) return content.replace(CONTINUE_RE, '').trimEnd()

  let segments = 0
  let stalled = 0
  let lastSignature = deps.progressSignature()
  const startTokens = deps.sessionTokens()
  // Ceilings are blocks, not hard stops: hitting one asks the writer for
  // another block (approval card) so a long book run resumes seamlessly.
  let segmentBudget = deps.maxContinuations
  let tokenBudget = deps.tokenCeiling
  let endNote: string | null = null

  const askForAnotherBlock = async(reason: string): Promise<boolean> => {
    if (!deps.requestContinuation || deps.signal?.aborted) return false
    deps.emitStatus('Book run paused at a safety ceiling', reason)
    try {
      return await deps.requestContinuation(reason)
    } catch {
      return false
    }
  }

  while (match) {
    if (deps.signal?.aborted || !deps.isAuto()) break
    if (segments >= segmentBudget) {
      const granted = await askForAnotherBlock(
        `The book run has used ${segments} auto-continued segments. Keep going?`
      )
      if (!granted) {
        endNote =
          `Book run paused after ${segments} segments (safety ceiling). ` +
          'Say **continue** to keep going.'
        break
      }
      segmentBudget = segments + deps.maxContinuations
    }
    const spent = deps.sessionTokens() - startTokens
    if (spent > tokenBudget) {
      const granted = await askForAnotherBlock(
        `The book run has consumed roughly ${Math.round(spent / 1000)}k tokens. Keep going?`
      )
      if (!granted) {
        endNote =
          'Book run paused — it reached its token budget for one run. ' +
          'Say **continue** to keep going.'
        break
      }
      tokenBudget = spent + deps.tokenCeiling
    }

    segments += 1
    deps.emitStatus(`Book run — segment ${segments + 1}`, match[1].slice(0, 160))
    try {
      content = await deps.invokeNext()
    } catch (error) {
      if (deps.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error
      }
      if (
        error instanceof Error &&
        (error.name === 'GraphRecursionError' || /recursion limit/i.test(error.message))
      ) {
        endNote =
          'A book-run segment hit its step budget. Everything so far is saved — ' +
          'say **continue** to keep going.'
        break
      }
      endNote = `Book run stopped on an error: ${
        error instanceof Error ? error.message : String(error)
      }`
      break
    }

    const signature = deps.progressSignature()
    if (signature === lastSignature) {
      stalled += 1
    } else {
      stalled = 0
      lastSignature = signature
    }
    match = CONTINUE_RE.exec(content)
    if (match && stalled >= 2) {
      endNote =
        'Book run paused — the last two segments made no visible progress. ' +
        'Check the plan and say **continue** if it should keep going.'
      break
    }
  }

  content = content.replace(CONTINUE_RE, '').trimEnd()
  if (endNote) content += `\n\n_${endNote}_`
  return content
}
