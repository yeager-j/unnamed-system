import { describe, expect, it } from "vitest"

import { goblin } from "@workspace/game-v2/catalog/enemies/humanoid"
import { makeParticipant } from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { resolveSession } from "@/domain/game-engine-v2"

import {
  durableMeta,
  inlineMeta,
  instanceWith,
  sessionWith,
  token,
  withDamage,
  withName,
  zone,
} from "./__fixtures__/combat-view"
import { buildRosterView } from "./roster-view"

const heroId = asParticipantId("hero")
const gobId = asParticipantId("gob")
const deadGobId = asParticipantId("dead-gob")

function rosterFixture() {
  const deadGob = makeParticipant(withDamage(goblin, 999), deadGobId, {
    side: "enemies",
  })
  const session = sessionWith([
    makeParticipant(withName(goblin, "Roan"), heroId, { side: "players" }),
    makeParticipant(goblin, gobId, { side: "enemies" }),
    { ...deadGob, overlay: { ...deadGob.overlay, ailments: ["downed"] } },
  ])

  const instance = instanceWith({
    zones: [zone("z1", "Hall")],
    occupancy: { [heroId]: token("z1") },
  })
  const view = resolveSession(session, instance)
  return buildRosterView(session, view, instance, {
    [heroId]: durableMeta("char-1"),
    [gobId]: inlineMeta,
    [deadGobId]: inlineMeta,
  })
}

describe("buildRosterView", () => {
  it("splits by side and rolls up downed enemies", () => {
    const roster = rosterFixture()

    expect(roster.players.map((row) => row.id)).toEqual([heroId])
    expect(roster.enemies.map((row) => row.id)).toEqual([gobId, deadGobId])
    expect(roster.enemyCount).toBe(2)
    expect(roster.downedEnemyCount).toBe(1)
  })

  it("resolves the storage home into the avatar variant", () => {
    const roster = rosterFixture()

    expect(roster.players[0]?.avatar.kind).toBe("portrait")
    expect(roster.enemies[0]?.avatar).toMatchObject({
      kind: "initials",
      label: "G",
      side: "enemies",
    })
  })

  it("resolves fallen state into the per-home down label", () => {
    const roster = rosterFixture()

    expect(roster.players[0]?.downLabel).toBeNull()
    expect(roster.enemies[1]).toMatchObject({
      isFallen: true,
      isDowned: true,
      downLabel: "Dead",
      hp: { current: 0, max: 16 },
    })
  })

  it("reads pools off the resolved view, zone names off occupancy", () => {
    const roster = rosterFixture()

    expect(roster.players[0]).toMatchObject({
      hp: { current: 16, max: 16 },
      sp: null,
      zoneName: "Hall",
      reactionAvailable: true,
    })
    expect(roster.enemies[0]?.zoneName).toBeNull()
  })
})
