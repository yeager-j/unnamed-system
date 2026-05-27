import type { SeedCharacter } from "@/lib/__fixtures__/seed-characters"

/**
 * The contract every E2E fixture file in this directory satisfies. Owned
 * by [lib/db/seed.ts](../../lib/db/seed.ts) on the seed side and by the
 * spec on the read/write side, so a new write spec only edits one location
 * (a new file in `e2e/fixtures/`) instead of two (`seed.ts` + spec).
 *
 * `characterId` is the deterministic `seed-char-${slug}` the seed inserts;
 * `url` is the `/c/{shortId}` route specs navigate to. Both are duplicated
 * here so specs don't have to reconstruct them.
 */
export interface E2EFixture {
  /** The {@link SeedCharacter} definition the seed inserts each run. */
  seed: SeedCharacter
  /** Stable DB id — `seed-char-${seed.slug}`. Specs use this for direct DB
   *  pokes (resetting pools, bumping a version, etc.). */
  characterId: string
  /** Stable public URL — `/c/${seed.shortId}`. Use as a `page.goto(...)` target. */
  url: string
}
