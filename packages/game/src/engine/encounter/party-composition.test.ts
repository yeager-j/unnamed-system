import { describe, expect, it } from "vitest"

import {
  derivePartyComposition,
  derivePartyCompositionBySide,
} from "@workspace/game/engine/encounter/party-composition"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { type Lineage } from "@workspace/game/foundation/character/lineage"
import {
  type CombatantSetup,
  type CombatSide,
} from "@workspace/game/foundation/encounter/session"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

function pc(side: CombatSide, characterId: string): CombatantSetup {
  return { side, ref: { kind: "pc", characterId }, zoneId: "z" }
}

function enemy(side: CombatSide): CombatantSetup {
  return {
    side,
    ref: {
      kind: "enemy",
      statBlock: {
        name: "Goblin",
        maxHP: 10,
        currentHP: 10,
        maxSP: 0,
        currentSP: 0,
        attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
      },
    },
    zoneId: "z",
  }
}

function build(setup: CombatantSetup[]) {
  return createCombatSession(sequentialIds())(setup)
}

const LINEAGES: Record<string, Lineage> = {
  "char-a": "warrior",
  "char-b": "warrior",
  "char-c": "mage",
}

describe("derivePartyComposition", () => {
  it("tallies each PC on the side by its Lineage, counting the character itself", () => {
    const session = build([
      pc("players", "char-a"),
      pc("players", "char-b"),
      pc("players", "char-c"),
    ])

    expect(derivePartyComposition(session, "players", LINEAGES)).toEqual({
      warrior: 2,
      mage: 1,
    })
  })

  it("counts only combatants on the requested side", () => {
    const session = build([pc("players", "char-a"), pc("enemies", "char-c")])

    expect(derivePartyComposition(session, "players", LINEAGES)).toEqual({
      warrior: 1,
    })
    expect(derivePartyComposition(session, "enemies", LINEAGES)).toEqual({
      mage: 1,
    })
  })

  it("ignores enemy refs (they have no Lineage)", () => {
    const session = build([pc("players", "char-a"), enemy("players")])

    expect(derivePartyComposition(session, "players", LINEAGES)).toEqual({
      warrior: 1,
    })
  })

  it("skips a PC whose Lineage cannot be resolved", () => {
    const session = build([pc("players", "char-a"), pc("players", "unknown")])

    expect(derivePartyComposition(session, "players", LINEAGES)).toEqual({
      warrior: 1,
    })
  })

  it("returns an empty composition for a side with no PCs", () => {
    const session = build([pc("players", "char-a")])

    expect(derivePartyComposition(session, "enemies", LINEAGES)).toEqual({})
  })
})

describe("derivePartyCompositionBySide", () => {
  it("derives a composition for every side", () => {
    const session = build([
      pc("players", "char-a"),
      pc("players", "char-c"),
      pc("enemies", "char-b"),
    ])

    expect(derivePartyCompositionBySide(session, LINEAGES)).toEqual({
      players: { warrior: 1, mage: 1 },
      enemies: { warrior: 1 },
    })
  })
})
