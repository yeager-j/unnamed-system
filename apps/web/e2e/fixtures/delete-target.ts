import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/delete-character.spec.ts`. Owned by the dev
 * user. Sized just large enough to prove CASCADE: one archetype, one
 * inventory item, one knife/chain. Lives in its own row because the
 * happy-path test removes it — `npm run db:seed` runs at the start of
 * every E2E invocation and re-inserts it via the same deterministic
 * upsert.
 */
const seed = makeSeedCharacter({
  slug: "delete-target",
  shortId: "delete-target",
  name: "Wren Halloway",
  items: [{ catalogItemKey: "longsword", equipped: false }],
})

export const deleteTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}
