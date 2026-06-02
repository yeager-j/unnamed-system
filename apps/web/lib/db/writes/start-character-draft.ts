import { db } from "@/lib/db/client"
import { characters } from "@/lib/db/schema/character"
import { insertWithShortId } from "@/lib/db/short-id"

/**
 * Inserts a fresh `status: "draft"` character row for `ownerId` and returns
 * the generated `shortId`. Defaults are deliberately minimal — empty `name`,
 * Balanced HP/SP path, zero current HP/SP — because the wizard hasn't
 * collected any of these yet. The Movement 4 finalize step (UNN-218) flips
 * `status` to `"finalized"` and writes the path-derived starting pools.
 *
 * Name seeds empty per ADR-002's "name-last" decision — the player names
 * the character in Movement 4 with the rest of the character's identity
 * already on the page, not on a blank screen at the start.
 *
 * Each call creates a new row (multiple drafts per user is intentional).
 * Cleanup is handled by the existing delete-character dialog (UNN-181), not
 * a uniqueness constraint here. The public `shortId` is minted (and retried on
 * the vanishingly rare collision) by {@link insertWithShortId}.
 */
export async function startCharacterDraft(
  ownerId: string
): Promise<{ shortId: string }> {
  return insertWithShortId(async (shortId) => {
    await db.insert(characters).values({
      ownerId,
      shortId,
      name: "",
      pathChoice: "balanced",
      currentHP: 0,
      currentSP: 0,
    })
    return { shortId }
  })
}
