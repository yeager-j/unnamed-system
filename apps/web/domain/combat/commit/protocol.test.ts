import { describe, expect, it } from "vitest"

import {
  makeParticipant,
  type EncounterState,
  type Session,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import { combatEnd, combatWrite, predictCombatWrite } from "./protocol"

const participantId = asParticipantId("participant-1")

const mapInstance: MapInstanceState = {
  geometry: {
    pages: { default: { id: "default", name: "Page 1" } },
    zones: {},
    connections: {},
  },
  occupancy: {},
  enchantment: null,
  reveal: {
    revealedZoneIds: [],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  },
  generation: { zones: {}, stubs: {}, connections: {}, grafts: {} },
  lastMovedTokenKey: null,
}

function state(): EncounterState {
  const session: Session = {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: [
      makeParticipant(
        {
          id: "entity-1",
          components: {
            identity: { name: "Goblin" },
            vitals: { base: 20, damage: 0 },
          },
        },
        participantId,
        { side: "enemies" }
      ),
    ],
  }
  return { session, mapInstance }
}

describe("showtime.combat.v1", () => {
  it("predicts sequential writes against the latest frame", () => {
    const first = predictCombatWrite(state(), {
      participantId,
      write: { component: "vitals", op: "damage", amount: 3 },
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = predictCombatWrite(first.value, {
      participantId,
      write: { component: "vitals", op: "damage", amount: 4 },
    })

    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(
        second.value.session.participants[0]!.entity.components.vitals
      ).toEqual({ base: 20, damage: 7 })
    }
  })

  it("returns Writer and removed-participant refusals", () => {
    expect(
      predictCombatWrite(state(), {
        participantId,
        write: { component: "skillPool", op: "damage", amount: 1 },
      })
    ).toEqual({ ok: false, error: "capability-missing" })

    const removed = state()
    removed.session = { ...removed.session, participants: [] }
    expect(
      predictCombatWrite(removed, {
        participantId,
        write: { component: "vitals", op: "damage", amount: 1 },
      })
    ).toEqual({ ok: false, error: "participant-not-found" })
  })

  it("puts only intent on the wire", () => {
    const invocation = combatWrite({
      encounterId: "encounter-1",
      participantId,
      write: { component: "vitals", op: "damage", amount: 1 },
    })

    expect(invocation).toEqual({
      name: "combat.write",
      args: {
        encounterId: "encounter-1",
        participantId,
        write: { component: "vitals", op: "damage", amount: 1 },
      },
    })
    expect(JSON.stringify(invocation)).not.toMatch(
      /version|axis|actor|storage|characterId|kind/
    )
  })

  it("ends combat with only the encounter intent on the wire", () => {
    const invocation = combatEnd({ encounterId: "encounter-1" })

    expect(invocation).toEqual({
      name: "combat.end",
      args: { encounterId: "encounter-1" },
    })
    expect(JSON.stringify(invocation)).not.toMatch(
      /version|axis|actor|dungeon|storage/
    )
  })
})
