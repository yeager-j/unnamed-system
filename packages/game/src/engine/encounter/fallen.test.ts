import { describe, expect, it } from "vitest"

import { enemyStatblocks } from "@workspace/game/engine/__fixtures__/encounter"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { fallenCombatantIds } from "@workspace/game/engine/encounter/fallen"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import {
  type CombatantSetup,
  type EnemyStatBlock,
} from "@workspace/game/foundation/encounter/session"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

function statBlock(currentHP: number): EnemyStatBlock {
  return {
    name: "Shadow",
    maxHP: 20,
    currentHP,
    maxSP: 0,
    currentSP: 0,
    attributes: { strength: 4, magic: 1, agility: 3, luck: 2 },
  }
}

/** combatant-0 PC (char-1), combatant-1 enemy, combatant-2 catalog enemy. */
function session(enemyHP: number) {
  const setup: CombatantSetup[] = [
    {
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      zoneId: "z",
    },
    {
      side: "enemies",
      ref: { kind: "enemy", statBlock: statBlock(enemyHP) },
      zoneId: "z",
    },
    {
      side: "enemies",
      ref: { kind: "catalog-enemy", enemyKey: "goblin" },
      zoneId: "z",
    },
  ]
  return createCombatSession(sequentialIds())(setup)
}

/** A fixture catalog whose "goblin" carries a positive definition max HP, so an
 *  unset working-HP goblin defaults to full — an assigned number, not the
 *  shipped creature's. */
const CATALOG = makeTestGameData({
  enemies: [makeEnemy({ key: "goblin", maxHP: 16 })],
})

/** Resolved statblocks for the catalog goblin in {@link session} (so an unset
 *  working-HP goblin defaults to its fixture >0 maxHP — not Fallen). */
const ENEMY_SB = enemyStatblocks(session(0).combatants, CATALOG)

describe("fallenCombatantIds", () => {
  it("includes an enemy whose inline statBlock HP is 0 or less", () => {
    const fallen = fallenCombatantIds(session(0), { "char-1": 10 }, ENEMY_SB)
    expect(fallen.has("combatant-1")).toBe(true)
  })

  it("includes a PC whose injected HP is 0 or less", () => {
    const fallen = fallenCombatantIds(session(20), { "char-1": 0 }, ENEMY_SB)
    expect(fallen.has("combatant-0")).toBe(true)
  })

  it("excludes healthy combatants", () => {
    const fallen = fallenCombatantIds(session(20), { "char-1": 10 }, ENEMY_SB)
    expect(fallen.has("combatant-0")).toBe(false)
    expect(fallen.has("combatant-1")).toBe(false)
  })

  it("excludes a catalog enemy whose working HP is unset (full by default)", () => {
    // The goblin ref carries no `currentHP`, so it defaults to the definition's
    // maxHP — full, hence not Fallen.
    const fallen = fallenCombatantIds(session(0), { "char-1": 0 }, ENEMY_SB)
    expect(fallen.has("combatant-2")).toBe(false)
  })

  it("includes a catalog enemy whose working HP is 0 or less", () => {
    const base = session(20)
    const downed = {
      ...base,
      combatants: base.combatants.map((c) =>
        c.id === "combatant-2"
          ? {
              ...c,
              ref: {
                kind: "catalog-enemy" as const,
                enemyKey: "goblin",
                currentHP: 0,
              },
            }
          : c
      ),
    }
    const fallen = fallenCombatantIds(downed, { "char-1": 10 }, ENEMY_SB)
    expect(fallen.has("combatant-2")).toBe(true)
  })

  it("treats an unknown catalog enemy with unset HP as Fallen (max falls back to 0)", () => {
    const s = createCombatSession(() => "lone")([
      {
        side: "enemies",
        ref: { kind: "catalog-enemy", enemyKey: "not-a-real-enemy" },
        zoneId: "z",
      },
    ])

    const fallen = fallenCombatantIds(s, {}, ENEMY_SB)

    expect(fallen.has("lone")).toBe(true)
  })

  it("does not treat the inline enemy as Fallen when only the catalog enemy is downed", () => {
    const base = session(20)
    const downed = {
      ...base,
      combatants: base.combatants.map((c) =>
        c.id === "combatant-2"
          ? {
              ...c,
              ref: {
                kind: "catalog-enemy" as const,
                enemyKey: "goblin",
                currentHP: 0,
              },
            }
          : c
      ),
    }

    const fallen = fallenCombatantIds(downed, { "char-1": 20 }, ENEMY_SB)

    expect(fallen.has("combatant-1")).toBe(false)
    expect(fallen.has("combatant-2")).toBe(true)
  })

  it("treats a PC with no injected HP entry as not Fallen", () => {
    const fallen = fallenCombatantIds(session(20), {}, ENEMY_SB)
    expect(fallen.has("combatant-0")).toBe(false)
  })

  it("drops a revived PC from the set (HP back above 0)", () => {
    expect(
      fallenCombatantIds(session(20), { "char-1": 0 }, ENEMY_SB).has(
        "combatant-0"
      )
    ).toBe(true)
    expect(
      fallenCombatantIds(session(20), { "char-1": 5 }, ENEMY_SB).has(
        "combatant-0"
      )
    ).toBe(false)
  })
})
