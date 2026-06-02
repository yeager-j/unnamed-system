/**
 * Parses and bounds-checks a numeric Rest input. Both the dice-spend fields
 * (capped at the remaining pool) and the SP/HP recovery fields (no upper
 * bound) flow through here so the parse → isFinite → range → invalid-flag
 * logic lives in one place. Mirrors the engine's `insufficient-*-dice` guards
 * so Submit can disable before the round-trip; the server still re-validates.
 */
export function validateDiceInput(
  raw: string,
  max?: number
): { value: number; invalid: boolean } {
  const value = Number.parseInt(raw, 10)
  const invalid =
    !Number.isFinite(value) || value < 0 || (max !== undefined && value > max)
  return { value, invalid }
}
