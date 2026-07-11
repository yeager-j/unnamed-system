import { describe, expect, it } from "vitest"

import { goblin } from "@workspace/game-v2/catalog/enemies/humanoid"
import type { Entity } from "@workspace/game-v2/kernel/entity"

import { resolveEntity } from "@/domain/game-engine-v2"

import { enemyStatblockView } from "./enemy-statblock-view"

function withoutTalents(entity: Entity): Entity {
  const components = { ...entity.components }
  delete components.talents
  return { ...entity, components }
}

describe("enemyStatblockView talents", () => {
  it("preserves absent, empty, and populated Talent capabilities", () => {
    const absent = withoutTalents(goblin)
    const empty: Entity = {
      ...goblin,
      components: { ...goblin.components, talents: [] },
    }

    expect(
      enemyStatblockView(absent, resolveEntity(absent), null).talentNames
    ).toBeNull()
    expect(
      enemyStatblockView(empty, resolveEntity(empty), null).talentNames
    ).toEqual([])
    expect(
      enemyStatblockView(goblin, resolveEntity(goblin), null).talentNames
    ).toEqual(["Sneak"])
  })
})
