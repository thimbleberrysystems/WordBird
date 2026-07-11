/**
 * Best-effort cost estimation for the token-usage tooltip.
 *
 * Prices are USD per MILLION tokens (input, output), substring-matched
 * against the connected model name, most-specific pattern first. Prices
 * drift — this is an estimate for orientation, never billing truth, and
 * unknown/local models simply show no cost.
 */

interface PriceEntry {
  match: string
  input: number
  output: number
}

// Ordered most-specific → least. Approximate mid-2026 list prices.
const PRICES: PriceEntry[] = [
  { match: 'gpt-4o-mini', input: 0.15, output: 0.6 },
  { match: 'gpt-4o', input: 2.5, output: 10 },
  { match: 'gpt-4.1-nano', input: 0.1, output: 0.4 },
  { match: 'gpt-4.1-mini', input: 0.4, output: 1.6 },
  { match: 'gpt-4.1', input: 2, output: 8 },
  { match: 'o3-mini', input: 1.1, output: 4.4 },
  { match: 'o3', input: 2, output: 8 },
  { match: 'o1-mini', input: 1.1, output: 4.4 },
  { match: 'o1', input: 15, output: 60 },
  { match: 'claude-opus', input: 15, output: 75 },
  { match: 'opus', input: 15, output: 75 },
  { match: 'claude-sonnet', input: 3, output: 15 },
  { match: 'sonnet', input: 3, output: 15 },
  { match: 'claude-haiku', input: 0.8, output: 4 },
  { match: 'haiku', input: 0.8, output: 4 },
  { match: 'gemini-2.5-pro', input: 1.25, output: 10 },
  { match: 'gemini-2.5-flash', input: 0.15, output: 0.6 },
  { match: 'gemini-1.5-pro', input: 1.25, output: 5 },
  { match: 'gemini-1.5-flash', input: 0.075, output: 0.3 },
  { match: 'gemini', input: 1.25, output: 5 }
]

/**
 * Estimated USD cost for the given token counts, or null when the model
 * is unknown (or local — callers should skip Ollama entirely).
 */
export const estimateCostUsd = (
  modelName: string | null | undefined,
  inputTokens: number,
  outputTokens: number
): number | null => {
  if (!modelName) return null
  const name = modelName.toLowerCase()
  const entry = PRICES.find((p) => name.includes(p.match))
  if (!entry) return null
  return (inputTokens * entry.input + outputTokens * entry.output) / 1_000_000
}

export const formatCostUsd = (cost: number): string =>
  cost >= 1 ? `$${cost.toFixed(2)}` : cost >= 0.01 ? `$${cost.toFixed(2)}` : '<$0.01'
