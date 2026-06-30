import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { ZoneEnchantment } from "@workspace/game-v2/mechanics/zone-enchantment.schema"

import type { MapInstanceState } from "./map-instance.schema"

/**
 * The **pure read selectors** over {@link MapInstanceState} the combat composition
 * binds its `SpatialReads` adapter from (ADR §2.6/SD8 — the subtlest correctness
 * point). Spatial exports these raw selectors over its **own** state and names
 * **neither** the `SpatialReads` port **nor** any `encounter/` type: a spatial
 * module that implemented the port (or produced `Position`) would import
 * `encounter/` and break the one-way seam (SD2). The combat side wraps these
 * `satisfies SpatialReads` and projects the occupancy token into the read-bag
 * (`encounter/spatial-adapter.ts`); the adapter hop is what keeps the dependency
 * one-way.
 *
 * The `tokenKey` is the occupancy key — opaque and dual-lifecycle (a `participantId`
 * in combat, a `characterId` in exploration, SD5); these selectors treat it as a
 * plain string-map key.
 */

/**
 * The zone a token occupies, or `undefined` when the key holds no token (unplaced /
 * mapless). Mirrors the `SpatialReads.zoneOf` contract exactly, so the adapter is a
 * one-liner: a bare `zoneId` string, never a `Position` component (spatial owns the
 * *fact* of placement without naming the *component*, SD8).
 */
export function zoneOf(
  state: MapInstanceState,
  tokenKey: string
): string | undefined {
  return state.occupancy[tokenKey]?.zoneId
}

/**
 * The single active Zone Enchantment, or `null` when none. The one-active-enchantment
 * rule is structural (a nullable singleton), so this is a bare field read — the value
 * the `SpatialReads.activeEnchantment` singleton returns.
 */
export function activeEnchantment(
  state: MapInstanceState
): ZoneEnchantment | null {
  return state.enchantment
}

/**
 * A token's {@link Engagement}, or **free** when the key holds no token — so a
 * mapless / unplaced participant reads as structurally un-engaged (CD17). The combat
 * read-bag flows this value straight into the `engagement` component (kernel type,
 * SD3 — no `encounter/` import, no duplication).
 */
export function engagementOf(
  state: MapInstanceState,
  tokenKey: string
): Engagement {
  return state.occupancy[tokenKey]?.engagement ?? { status: "free" }
}
