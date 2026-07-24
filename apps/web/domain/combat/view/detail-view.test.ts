import { describe, expect, it } from "vitest"

import { goblin } from "@workspace/game-v2/catalog/enemies/humanoid"
import { makeParticipant, type Session } from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import type { CombatantSheetSlice } from "@/domain/combat/sheet-slice"
import { resolveSession } from "@/domain/game-engine-v2"

import { combatantDetail } from "./detail-view"

const goblinId = asParticipantId("goblin")

const mapless: MapInstanceState = {
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
  generation: {
    zones: {},
    stubs: {},
    connections: {},
    grafts: {},
    startingZoneIds: [],
  },
  lastMovedTokenKey: null,
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
        }
      : { storage: "inline" },
    sheetSlice
  )!
}

const warriorSlice: CombatantSheetSlice = {
  className: "Warrior",
  pronouns: "they/them",
  skills: [],
}

describe("combatantDetail", () => {
  it("keeps complete session-resolved Skills for an inline combatant", () => {
    const detail = detailFor(goblin)

    expect(detail.stats.skills).toHaveLength(2)
    expect(detail.stats.skills[0]).toMatchObject({
      skill: { key: "goblin-scimitar" },
      resolvedCost: { kind: "sp", amount: 1 },
      resolvedAttackRoll: { total: 0 },
    })
    expect(detail.stats.hasSkillPool).toBe(false)
  })

  it("keeps rich Skills when the participant has no attributes", () => {
    const detail = detailFor(withoutCapability(goblin, "attributes"))

    expect(detail.stats.attributes).toBeNull()
    expect(detail.stats.skills[0]?.resolvedAttackRoll).toMatchObject({
      total: 0,
    })
  })

  it("uses the sheet slice Skills for a durable participant", () => {
    const sessionSkills = detailFor(goblin).stats.skills
    const sheetSlice: CombatantSheetSlice = {
      ...warriorSlice,
      skills: [sessionSkills[1]!],
    }

    const detail = detailFor(goblin, sheetSlice)

    expect(detail.stats.skills).toEqual(sheetSlice.skills)
    expect(detail.header.subtitle).toContain("Warrior")
    expect(detail.header.subtitle).toContain("they/them")
  })

  it("resolves every PC display question in the header and vitals", () => {
    const detail = detailFor(goblin, warriorSlice)

    expect(detail.header.avatar.kind).toBe("portrait")
    expect(detail.header.persistenceNote).toContain("character sheet")
    expect(detail.vitals.affordances.setMax).toBe(false)
  })

  it("resolves every enemy display question in the header and vitals", () => {
    const detail = detailFor(goblin)

    expect(detail.header.avatar).toMatchObject({
      kind: "initials",
      side: "enemies",
    })
    expect(detail.header.subtitle).toContain("Enemy")
    expect(detail.header.persistenceNote).toContain("this encounter only")
    expect(detail.vitals.affordances.setMax).toBe(true)
  })

  it.each([
    ["absent", withoutCapability(goblin, "talents"), null],
    ["empty", withEmptyTalents(goblin), []],
    ["populated", goblin, ["sneak"]],
  ] as const)("represents %s talents capability", (_case, entity, expected) => {
    expect(detailFor(entity).stats.talentKeys).toEqual(expected)
  })
})

function withoutCapability(
  entity: Entity,
  capability: keyof Entity["components"]
) {
  const components = { ...entity.components }
  delete components[capability]
  return { ...entity, components }
}

function withEmptyTalents(entity: Entity): Entity {
  return { ...entity, components: { ...entity.components, talents: [] } }
}
