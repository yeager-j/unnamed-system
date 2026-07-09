import { describe, expect, it } from "vitest"

import { goblin } from "@workspace/game-v2/catalog/enemies/humanoid"
import { makeParticipant, type Session } from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import { resolveSession } from "@/lib/game-engine-v2"

import { combatantDetail, type CombatantSheetSlice } from "./detail-view"

const goblinId = asParticipantId("goblin")

const mapless: MapInstanceState = {
  geometry: { zones: {}, connections: {} },
  occupancy: {},
  enchantment: null,
  reveal: {
    revealedZoneIds: [],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  },
}

function detailFor(entity: Entity, sheetSlice?: CombatantSheetSlice) {
  const session: Session = {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: [makeParticipant(entity, goblinId, { side: "enemies" })],
  }
  const view = resolveSession(session, mapless)
  return combatantDetail(
    session,
    view,
    mapless,
    goblinId,
    sheetSlice
      ? {
          storage: "durable",
          characterId: "character-1",
          characterShortId: "character",
          vitalsVersion: 1,
        }
      : { storage: "inline" },
    sheetSlice
  )!
}

function withoutCapability(
  entity: Entity,
  capability: keyof Entity["components"]
) {
  const components = { ...entity.components }
  delete components[capability]
  return { ...entity, components }
}

describe("combatantDetail", () => {
  it("keeps complete session-resolved Skills for an inline combatant", () => {
    const detail = detailFor(goblin)

    expect(detail.skills).toHaveLength(2)
    expect(detail.skills[0]).toMatchObject({
      skill: { key: "goblin-scimitar" },
      resolvedCost: { kind: "sp", amount: 1 },
      resolvedAttackRoll: { total: 0 },
    })
    expect(detail.hasSkillPool).toBe(false)
  })

  it("keeps rich Skills when the participant has no attributes", () => {
    const detail = detailFor(withoutCapability(goblin, "attributes"))

    expect(detail.attributes).toBeNull()
    expect(detail.skills[0]?.resolvedAttackRoll).toMatchObject({ total: 0 })
  })

  it("uses the sheet slice Skills for a durable participant", () => {
    const sessionSkills = detailFor(goblin).skills
    const sheetSlice: CombatantSheetSlice = {
      className: "Warrior",
      pronouns: "they/them",
      skills: [sessionSkills[1]!],
    }

    const detail = detailFor(goblin, sheetSlice)

    expect(detail.skills).toEqual(sheetSlice.skills)
    expect(detail.className).toBe("Warrior")
    expect(detail.pronouns).toBe("they/them")
  })

  it.each([
    ["absent", withoutCapability(goblin, "talents"), null],
    ["empty", withEmptyTalents(goblin), []],
    ["populated", goblin, ["sneak"]],
  ] as const)("represents %s talents capability", (_case, entity, expected) => {
    expect(detailFor(entity).talentKeys).toEqual(expected)
  })
})

function withEmptyTalents(entity: Entity): Entity {
  return { ...entity, components: { ...entity.components, talents: [] } }
}
