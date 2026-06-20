import { describe, expect, it } from "vitest"

import {
  enemyStatblocks,
  makeEncounter,
} from "@workspace/game/engine/__fixtures__/encounter"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  appendOrdinals,
  combatantDisplayNames,
  type PcInfo,
} from "@workspace/game/engine/encounter/console-view"
import { type CombatantSetup } from "@workspace/game/foundation/encounter/session"

describe("appendOrdinals", () => {
  it("leaves a base name that appears once bare", () => {
    expect(appendOrdinals(["Aria", "Goblin"])).toEqual(["Aria", "Goblin"])
  })

  it("numbers repeats from the second occurrence, the first staying bare", () => {
    expect(appendOrdinals(["Bandit", "Bandit", "Bandit"])).toEqual([
      "Bandit",
      "Bandit 2",
      "Bandit 3",
    ])
  })

  it("counts each base name independently, preserving input order", () => {
    expect(
      appendOrdinals(["Goblin", "Aria", "Goblin", "Bandit", "Aria"])
    ).toEqual(["Goblin", "Aria", "Goblin 2", "Bandit", "Aria 2"])
  })

  it("returns an empty array for empty input", () => {
    expect(appendOrdinals([])).toEqual([])
  })
})

const GOBLIN = makeEnemy({ key: "goblin", name: "Goblin", maxHP: 16 })
const CATALOG = makeTestGameData({ enemies: [GOBLIN] })
const PC_INFO: Record<string, PcInfo> = {
  "char-aria": { name: "Aria", currentHP: 30 },
}

function pc(characterId: string): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId: "z1" }
}

function goblin(): CombatantSetup {
  return {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "z1",
  }
}

describe("combatantDisplayNames", () => {
  it("numbers duplicate enemies while a lone PC stays bare, keyed by combatant id", () => {
    const { session } = makeEncounter([
      pc("char-aria"),
      goblin(),
      goblin(),
      goblin(),
    ])

    const names = combatantDisplayNames(
      session,
      PC_INFO,
      enemyStatblocks(session.combatants, CATALOG)
    )

    expect(session.combatants.map((c) => names.get(c.id))).toEqual([
      "Aria",
      "Goblin",
      "Goblin 2",
      "Goblin 3",
    ])
  })

  it("counts enemies independently of an interleaved PC, in session order", () => {
    const { session } = makeEncounter([goblin(), pc("char-aria"), goblin()])

    const names = combatantDisplayNames(
      session,
      PC_INFO,
      enemyStatblocks(session.combatants, CATALOG)
    )

    expect(session.combatants.map((c) => names.get(c.id))).toEqual([
      "Goblin",
      "Aria",
      "Goblin 2",
    ])
  })
})
