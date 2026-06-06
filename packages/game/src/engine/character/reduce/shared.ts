import type { RawCharacterInputs } from "@workspace/game/engine/character/derive-hydrated-character"
import type { CharacterRow } from "@workspace/game/foundation/character/records"
import type { Result } from "@workspace/game/foundation/result"

/**
 * What a domain slice returns: the next {@link RawCharacterInputs} to re-derive
 * from, or `null` to signal a no-op / engine-rejected edit. The orchestrator
 * ({@link reduceCharacter}) owns the single derive-or-return-unchanged rule, so
 * a slice never derives or sees the {@link import("../hydrated-character").HydratedCharacter}
 * it would produce.
 */
export type SliceResult = RawCharacterInputs | null

/** Spreads a `characters`-row patch onto the raw inputs. */
export function patchRow(
  raw: RawCharacterInputs,
  patch: Partial<CharacterRow>
): RawCharacterInputs {
  return { ...raw, row: { ...raw.row, ...patch } }
}

/**
 * Bridges a pure engine {@link Result} into a {@link SliceResult}: applies the
 * row patch on success, or rejects the edit (`null`) on failure.
 */
export function fromResult(
  raw: RawCharacterInputs,
  result: Result<Partial<CharacterRow>, string>
): SliceResult {
  return result.ok ? patchRow(raw, result.value) : null
}
