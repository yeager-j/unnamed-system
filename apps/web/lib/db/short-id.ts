import { customAlphabet } from "nanoid"

/**
 * URL-safe 8-character `shortId`s for public, shareable routes — the character
 * sheet (`/characters/{shortId}`) and the encounter player view. The alphabet drops
 * visually ambiguous characters (`0/O`, `1/I/l`) so a player reading the URL
 * out loud doesn't transcribe it wrong, and is restricted to a single case so
 * case-insensitive copy/paste doesn't 404.
 *
 * 8 chars × 32-symbol alphabet ≈ 10¹² combinations — collisions are vanishingly
 * unlikely at the scale this app will ever see, but {@link insertWithShortId}
 * retries on uniqueness violation anyway.
 */
const SHORT_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"

/** Mints a fresh 8-char `shortId`. */
export const generateShortId = customAlphabet(SHORT_ID_ALPHABET, 8)

/**
 * Number of times to retry a fresh `shortId` if the random pick happens to
 * collide with an existing row. With 32⁸ ≈ 10¹² possibilities, two retries
 * cover any realistic scenario; throwing past that means something is wrong
 * (e.g., the alphabet shrank or the DB is somehow exhausted).
 */
const MAX_SHORT_ID_RETRIES = 3

/**
 * Runs `insert` with freshly-minted `shortId`s, retrying on a unique-constraint
 * violation up to {@link MAX_SHORT_ID_RETRIES} times. The caller owns the actual
 * insert (so this stays storage-agnostic); it just supplies the candidate id and
 * handles the collision retry. A `23505` is treated as a `shortId` collision and
 * retried with a fresh id. Most callers have `shortId` as their only non-PK
 * unique column; `campaigns` also has a unique `joinToken`, but its
 * `$defaultFn` re-mints on every insert attempt, so a retry refreshes both and
 * the (astronomically unlikely) `joinToken` collision self-heals too.
 */
export async function insertWithShortId<T>(
  insert: (shortId: string) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < MAX_SHORT_ID_RETRIES; attempt += 1) {
    const shortId = generateShortId()
    try {
      return await insert(shortId)
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_SHORT_ID_RETRIES - 1) {
        continue
      }
      throw error
    }
  }
  throw new Error("insertWithShortId: exhausted shortId retries")
}

/** True when `error` is a Postgres unique-constraint violation (`23505`). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  )
}
