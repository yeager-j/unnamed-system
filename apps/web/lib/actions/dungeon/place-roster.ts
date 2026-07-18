import { addOccupant, type MapInstanceState } from "@workspace/game-v2/spatial"

/**
 * Places each staged PC token onto the snapshotted geometry (keyed by
 * `characterId`) and reveals each starting Zone that exists in the geometry —
 * placement is the party's first "entry", the initial `move → reveal`. A
 * placement pointing at a Zone the geometry doesn't carry still places the token
 * (guides, doesn't block) but reveals nothing.
 *
 * Reveal is a **union** into whatever the base state already carries, never a
 * replacement: an ordinary delve starts from an empty overlay (identical
 * behavior), while an expedition start runs *after* `applyStaticReveal` has
 * re-applied the Region's fold (UNN-589 D5) — a replacing write here would
 * silently wipe it.
 *
 * **Security invariant (fog-redaction gate):** a real delve reveals ≥1 starting
 * Zone here, which is what {@link
 * import("@workspace/game-v2/spatial/reveal").isFogActive} keys off to fog-redact
 * the public encounter snapshot ({@link
 * import("@workspace/game-v2/visibility").projectSpatialEncounterSnapshot}).
 * The only way `revealedZoneIds` stays empty is a degenerate delve whose every
 * placement points off-geometry (no party token on a real Zone) — broken, not a
 * runnable fight. If an explicit delve marker ever lands on the Instance, prefer
 * gating the redaction on that structural signal instead of this emergent one.
 */
export function placeRoster(
  base: MapInstanceState,
  placements: readonly { characterId: string; zoneId: string }[]
): MapInstanceState {
  let next = base
  const revealed = [...base.reveal.revealedZoneIds]
  for (const { characterId, zoneId } of placements) {
    next = addOccupant(next, characterId, {
      zoneId,
      engagement: { status: "free" },
    })
    if (
      next.geometry.zones[zoneId] !== undefined &&
      !revealed.includes(zoneId)
    ) {
      revealed.push(zoneId)
    }
  }
  return { ...next, reveal: { ...next.reveal, revealedZoneIds: revealed } }
}
