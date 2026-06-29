import { describe, expect, it } from "vitest"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"
import { dm } from "@workspace/game-v2/visibility/__fixtures__/redaction"
import {
  projectEncounterSnapshot,
  type EncounterSnapshotMeta,
} from "@workspace/game-v2/visibility/snapshot"

import { sessionOf } from "./__fixtures__/session"
import { compareInitiative } from "./initiative"
import { resolveSession } from "./participant-view"
import { makeParticipant } from "./session"
import type { SpatialReads } from "./spatial-reads"

/**
 * The zone-context-consistency guarantee (UNN-525): `resolveSession` resolves every
 * participant **once, with its zone-enchantment context**, so a zone effect that
 * folds into a stat is reflected **uniformly** across a turn-loop read and the
 * snapshot — they consume the one resolved view and cannot drift. (Before this
 * boundary the turn-loop reads resolved context-blind while the snapshot resolved
 * with context; a stat-affecting enchantment would have shown in one and not the
 * other.)
 *
 * The 3 shipped enchantments only touch `pendingEffects`, so this stands in a future
 * **Agility-buffing** enchantment with a stub `resolveEntity` that folds the zone's
 * effect amount into `attributes.agility` — the smallest fixture that exercises a
 * resolved stat reachable by both a turn-loop read (initiative) and the snapshot.
 */

const BASE_AGILITY = 5

/** A stub mechanic-aware resolve: agility = base + Σ(zone effect amounts), so a
 *  combatant standing in the enchanted zone resolves a higher Agility. */
function resolveWithZoneAgility(
  entity: Entity,
  context: ResolveContext = {}
): ResolvedEntity {
  const bump = (context.effects ?? []).reduce(
    (sum, effect) =>
      sum + (effect.type === "attackRoll" ? (effect.amount ?? 0) : 0),
    0
  )
  return {
    id: entity.id,
    components: {
      identity: { name: entity.id },
      attributes: {
        strength: 0,
        magic: 0,
        agility: BASE_AGILITY + bump,
        luck: 0,
      },
    },
  }
}

const META: EncounterSnapshotMeta = {
  status: "live",
  name: "Zone Test",
  campaignShortId: "camp",
  version: 1,
}

describe("resolveSession — zone context is reflected uniformly across reads + snapshot (UNN-525)", () => {
  // Player A stands in the Toccata-enchanted zone z1 (forte 2 → +2); enemy B is
  // unplaced, so it folds in nothing.
  const spatial: SpatialReads = {
    zoneOf: (id) => (id === asParticipantId("pA") ? "z1" : undefined),
    activeEnchantment: () => ({ zoneId: "z1", type: "toccata", forte: 2 }),
  }
  const session = sessionOf([
    makeParticipant({ id: "entA", components: {} }, asParticipantId("pA"), {
      side: "players",
    }),
    makeParticipant({ id: "entB", components: {} }, asParticipantId("pB"), {
      side: "enemies",
    }),
  ])

  it("a zone-buffed Agility shows identically in initiative and the snapshot", () => {
    const view = resolveSession(session, spatial, resolveWithZoneAgility)

    // Turn-loop read: A's side leads on the zone-bumped Agility (7 vs B's base 5).
    const initiative = compareInitiative(view)
    expect(initiative.players.highestAgility).toBe(BASE_AGILITY + 2)
    expect(initiative.enemies.highestAgility).toBe(BASE_AGILITY)
    expect(initiative.suggested).toBe("players")

    // Snapshot (DM sees all stats): the same bumped/base Agility, from the same view.
    const snapshot = projectEncounterSnapshot(session, view, dm(), META)
    const byId = new Map(snapshot.combatants.map((c) => [c.id, c]))
    expect(
      byId.get(asParticipantId("pA"))!.components.attributes?.agility
    ).toBe(BASE_AGILITY + 2)
    expect(
      byId.get(asParticipantId("pB"))!.components.attributes?.agility
    ).toBe(BASE_AGILITY)
  })
})
