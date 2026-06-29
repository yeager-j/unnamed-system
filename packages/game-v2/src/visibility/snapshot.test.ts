import { describe, expect, it } from "vitest"

import {
  participantWith,
  sessionOf,
} from "@workspace/game-v2/encounter/__fixtures__/session"
import type {
  ParticipantView,
  ParticipantViewComponents,
} from "@workspace/game-v2/encounter/participant-view"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import { makeParticipantView, spectator } from "./__fixtures__/redaction"
import {
  projectEncounterSnapshot,
  type EncounterSnapshotMeta,
} from "./snapshot"

const META: EncounterSnapshotMeta = {
  status: "live",
  name: "Goblin Ambush",
  campaignShortId: "camp123",
  version: 7,
}

/**
 * A participant-view keyed by its **participant** id, carrying a **distinct entity** id
 * (`${pid}-entity`) — mirrors production, where `assembleParticipantView` sets `bag.id` to
 * the entity id while the loader keys the map by participant id. The distinctness
 * is what proves `combatants[].id` is the roster id, not the entity id.
 */
function placed(
  pid: string,
  side: CombatSide,
  components?: Partial<ParticipantViewComponents>
): [ParticipantId, ParticipantView] {
  return [
    asParticipantId(pid),
    makeParticipantView({ id: `${pid}-entity`, side, components }),
  ]
}

function viewOf(
  ...entries: [ParticipantId, ParticipantView][]
): ReadonlyMap<ParticipantId, ParticipantView> {
  return new Map(entries)
}

describe("projectEncounterSnapshot — the default-deny envelope (CD12; ADR §2.6)", () => {
  it("emits exactly the whitelisted top-level fields — no instanceVersion, no pendingEffects", () => {
    const session = sessionOf([participantWith({ id: "p1", side: "players" })])
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(placed("p1", "players")),
      spectator(),
      META
    )

    expect(Object.keys(snapshot).sort()).toEqual([
      "campaignShortId",
      "combatants",
      "currentActor",
      "name",
      "round",
      "status",
      "version",
    ])
  })

  it("passes the row metadata through and reads round off the session", () => {
    const session = sessionOf(
      [participantWith({ id: "p1", side: "players" })],
      {
        round: 3,
      }
    )
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(placed("p1", "players")),
      spectator(),
      META
    )

    expect(snapshot).toMatchObject({
      status: "live",
      name: "Goblin Ambush",
      campaignShortId: "camp123",
      version: 7,
      round: 3,
    })
  })

  it("keeps combatants in session (turn) order", () => {
    const session = sessionOf([
      participantWith({ id: "p1", side: "players" }),
      participantWith({ id: "e1", side: "enemies" }),
      participantWith({ id: "p2", side: "players" }),
    ])
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(
        placed("p1", "players"),
        placed("e1", "enemies"),
        placed("p2", "players")
      ),
      spectator(),
      META
    )

    expect(snapshot.combatants.map((c) => c.id)).toEqual(["p1", "e1", "p2"])
  })

  it("keys combatants by the participant/roster id — correlating with currentActor + engagement targets, NOT the entity id", () => {
    const session = sessionOf(
      [
        participantWith({ id: "p1", side: "players" }),
        participantWith({ id: "e1", side: "enemies" }),
      ],
      { currentActorId: "p1" }
    )
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(
        // p1 is melee-locked with the *participant* id "e1" (not "e1-entity").
        placed("p1", "players", {
          engagement: {
            status: "engaged",
            targetCombatantIds: [asParticipantId("e1")],
          },
        }),
        placed("e1", "enemies")
      ),
      spectator(),
      META
    )

    const ids = snapshot.combatants.map((c) => c.id)
    // roster ids, never the `*-entity` ids the participant-views carry.
    expect(ids).toEqual(["p1", "e1"])
    expect(snapshot.currentActor?.id).toBe("p1")
    expect(ids).toContain(snapshot.currentActor?.id)
    // the engagement target id resolves to a combatant in the snapshot.
    const engagement = snapshot.combatants[0]!.components.engagement
    const targets =
      engagement?.status === "engaged" ? engagement.targetCombatantIds : []
    expect(targets).toEqual(["e1"])
    expect(ids).toContain(targets[0])
  })

  it("excludes pendingEffects from a redacted combatant (display-only DM producer)", () => {
    const session = sessionOf([participantWith({ id: "e1", side: "enemies" })])
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(
        placed("e1", "enemies", {
          pendingEffects: { attackRoll: [], damage: [] },
        })
      ),
      spectator(),
      META
    )

    expect("pendingEffects" in snapshot.combatants[0]!.components).toBe(false)
  })

  it("omits a participant the loader assembled no participant-view for", () => {
    const session = sessionOf([
      participantWith({ id: "p1", side: "players" }),
      participantWith({ id: "p2", side: "players" }),
    ])
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(placed("p1", "players")),
      spectator(),
      META
    )

    expect(snapshot.combatants.map((c) => c.id)).toEqual(["p1"])
  })
})

describe("projectEncounterSnapshot — currentActor (RED-5 public subset)", () => {
  it("is the acting combatant's {id, name, side} keyed by the roster id", () => {
    const session = sessionOf(
      [
        participantWith({ id: "p1", side: "players" }),
        participantWith({ id: "e1", side: "enemies" }),
      ],
      { currentActorId: "e1" }
    )
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(
        placed("p1", "players"),
        placed("e1", "enemies", { identity: { name: "Goblin" } })
      ),
      spectator(),
      META
    )

    expect(snapshot.currentActor).toEqual({
      id: "e1",
      name: "Goblin",
      side: "enemies",
    })
  })

  it("is null when no one is acting", () => {
    const session = sessionOf(
      [participantWith({ id: "p1", side: "players" })],
      {
        currentActorId: null,
      }
    )
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(placed("p1", "players")),
      spectator(),
      META
    )

    expect(snapshot.currentActor).toBeNull()
  })

  it("falls back to the roster id when the actor carries no identity name", () => {
    const session = sessionOf(
      [participantWith({ id: "p1", side: "players" })],
      {
        currentActorId: "p1",
      }
    )
    const snapshot = projectEncounterSnapshot(
      session,
      viewOf(placed("p1", "players")),
      spectator(),
      META
    )

    expect(snapshot.currentActor).toEqual({
      id: "p1",
      name: "p1",
      side: "players",
    })
  })
})
