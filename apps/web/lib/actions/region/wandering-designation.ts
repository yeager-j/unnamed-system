import type { TemplateSetContent } from "@workspace/game-v2/generation"
import { err, ok, type Result } from "@workspace/result"

/**
 * The wandering-designation rule (UNN-589 D7), decided once for both region
 * write doors (`create`, `update-settings`): a designated `wanderingTableKey`
 * must name a table in the bound Template Set's content — the last calm moment
 * to prevent a mid-session dead click on the wandering panel. No key means no
 * designation, which is always legal.
 */
export function checkWanderingDesignation(
  content: TemplateSetContent,
  wanderingTableKey: string | undefined
): Result<void, "wandering-table-not-found"> {
  // "Designated" is strictly `!== undefined`: the schema pins a present key to
  // be non-empty (`min(1)`), so an empty string can't reach here — and if that
  // invariant ever regressed, treating "" as designated fails loudly here
  // rather than minting an expedition with wandering enabled and no table.
  if (
    wanderingTableKey !== undefined &&
    !Object.hasOwn(content.tables, wanderingTableKey)
  ) {
    return err("wandering-table-not-found")
  }
  return ok(undefined)
}
