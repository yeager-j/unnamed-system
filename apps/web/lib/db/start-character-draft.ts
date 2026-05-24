import { customAlphabet } from "nanoid"

import { db } from "./index"
import { characters } from "./schema/character"

/**
 * URL-safe 8-character `shortId`s for the public `/c/{shortId}` route. The
 * alphabet drops visually ambiguous characters (`0/O`, `1/I/l`) so a player
 * reading the URL out loud doesn't transcribe it wrong, and is restricted
 * to a single case so case-insensitive copy/paste doesn't 404.
 *
 * 8 chars × 32-symbol alphabet ≈ 10¹² combinations — collisions are
 * vanishingly unlikely at the scale this app will ever see, but the insert
 * path retries on uniqueness violation anyway.
 */
const SHORT_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
const generateShortId = customAlphabet(SHORT_ID_ALPHABET, 8)

/**
 * Number of times to retry a fresh `shortId` if the random pick happens to
 * collide with an existing row. With 32⁸ ≈ 10¹² possibilities, two retries
 * cover any realistic scenario; throwing past that means something is wrong
 * (e.g., the alphabet shrank or the DB is somehow exhausted).
 */
const MAX_SHORT_ID_RETRIES = 3

/**
 * Placeholder character name a fresh draft is seeded with. The user replaces
 * it in the Basic info step before they can advance — the Next gate
 * recognizes this exact string as "not yet named." Storing a non-empty
 * default keeps every downstream consumer (My Characters card, delete
 * confirmation, toasts) from needing its own empty-name fallback.
 */
export const DRAFT_NAME_PLACEHOLDER = "Untitled character"

/**
 * Inserts a fresh `status: "draft"` character row for `ownerId` and returns
 * the generated `shortId`. Defaults are deliberately minimal — empty `name`,
 * Balanced HP/SP path, zero current HP/SP — because the wizard hasn't
 * collected any of these yet. Once the player completes the Review step
 * (UNN-206), `status` flips to `"finalized"` and the real values are
 * written.
 *
 * Each call creates a new row (multiple drafts per user is intentional).
 * Cleanup is handled by the existing delete-character dialog (UNN-181), not
 * a uniqueness constraint here.
 */
export async function startCharacterDraft(
  ownerId: string
): Promise<{ shortId: string }> {
  for (let attempt = 0; attempt < MAX_SHORT_ID_RETRIES; attempt += 1) {
    const shortId = generateShortId()
    try {
      await db.insert(characters).values({
        ownerId,
        shortId,
        name: DRAFT_NAME_PLACEHOLDER,
        pathChoice: "balanced",
        currentHP: 0,
        currentSP: 0,
      })
      return { shortId }
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_SHORT_ID_RETRIES - 1) {
        continue
      }
      throw error
    }
  }
  throw new Error("startCharacterDraft: exhausted shortId retries")
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  )
}
