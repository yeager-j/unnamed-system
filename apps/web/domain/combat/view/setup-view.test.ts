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
  withName,
  zone,
} from "./__fixtures__/combat-view"
import { buildSetupRows } from "./setup-view"

const heroId = asParticipantId("hero")
const gobId = asParticipantId("gob")
const strayId = asParticipantId("stray")

function setupFixture() {
  const session = sessionWith([
    makeParticipant(withName(goblin, "Roan"), heroId, { side: "players" }),
    makeParticipant(goblin, gobId, { side: "enemies" }),
    makeParticipant(withName(goblin, "Stray"), strayId, { side: "enemies" }),
  ])
  const instance = instanceWith({
    zones: [zone("z1", "Hall")],
    occupancy: {
      [heroId]: token("z1", {
        status: "engaged",
        targetCombatantIds: [gobId],
      }),
      [gobId]: token("z1"),
    },
  })
  return buildSetupRows(session, resolveSession(session, instance), instance, {
    [heroId]: durableMeta("char-1"),
    [gobId]: inlineMeta,
    [strayId]: inlineMeta,
  })
}

describe("buildSetupRows", () => {
  it("surfaces the backing character for durable rows only", () => {
    const [hero, gob, stray] = setupFixture()

    expect(hero?.characterId).toBe("char-1")
    expect(gob?.characterId).toBeNull()
    expect(stray?.characterId).toBeNull()
  })

  it("reads the zone off occupancy, with the empty-string unplaced sentinel", () => {
    const [hero, , stray] = setupFixture()

    expect(hero?.zoneId).toBe("z1")
    expect(stray?.zoneId).toBe("")
  })

  it("offers same-zone opposite-side candidates, keeping current targets clearable", () => {
    const [hero, gob] = setupFixture()

    expect(hero?.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: [gobId],
    })
    expect(hero?.engagementOptions.map((option) => option.id)).toContain(gobId)
    expect(gob?.engagementOptions.map((option) => option.id)).toContain(heroId)
  })
})
