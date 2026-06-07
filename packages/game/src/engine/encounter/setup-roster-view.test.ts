import { describe, expect, it } from "vitest"

import { enemyStatblocks } from "@workspace/game/engine/__fixtures__/encounter"
import {
  buildSetupCombatantLabels,
  engageableTargets,
  isRosterFullyPlaced,
  normalizeEngagements,
  setEngagementTargets,
} from "@workspace/game/engine/encounter/setup-roster-view"
import type {
  CombatantSetup,
  CombatSession,
} from "@workspace/game/foundation/encounter/session"

/** Resolves the enemy statblocks for the setup roster under test so catalog
 *  enemies render their real names. */
const setupLabels = (
  setups: Parameters<typeof buildSetupCombatantLabels>[0],
  pcNameById: Parameters<typeof buildSetupCombatantLabels>[1]
) => buildSetupCombatantLabels(setups, pcNameById, enemyStatblocks(setups))

function catalogEnemy(enemyKey: string): CombatantSetup {
  return {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey },
    zoneId: "",
  }
}

function pc(characterId: string): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId: "" }
}

describe("buildSetupCombatantLabels", () => {
  it("resolves catalog enemy names and numbers duplicates in roster order", () => {
    const labels = setupLabels(
      [catalogEnemy("goblin"), catalogEnemy("goblin"), catalogEnemy("goblin")],
      {}
    )
    expect(labels).toEqual(["Goblin", "Goblin 2", "Goblin 3"])
  })

  it("leaves a singleton un-numbered", () => {
    expect(setupLabels([catalogEnemy("goblin")], {})).toEqual(["Goblin"])
  })

  it("reads an inline enemy's name off its stat block", () => {
    const inline: CombatantSetup = {
      side: "enemies",
      ref: {
        kind: "enemy",
        statBlock: {
          name: "Brigand",
          maxHP: 10,
          currentHP: 10,
          maxSP: 0,
          currentSP: 0,
          attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
        },
      },
      zoneId: "",
    }
    expect(setupLabels([inline], {})).toEqual(["Brigand"])
  })

  it("resolves PC names from the injected map and numbers per base name", () => {
    const labels = setupLabels(
      [pc("char-1"), catalogEnemy("goblin"), catalogEnemy("goblin")],
      { "char-1": "Brannis" }
    )
    expect(labels).toEqual(["Brannis", "Goblin", "Goblin 2"])
  })

  it("falls back to the raw key when a catalog lookup misses", () => {
    expect(setupLabels([catalogEnemy("nope")], {})).toEqual(["nope"])
  })

  it("is index-aligned to the input", () => {
    const setups = [catalogEnemy("goblin"), pc("char-1")]
    expect(setupLabels(setups, { "char-1": "Roan" })).toHaveLength(
      setups.length
    )
  })
})

function zone(id: string): CombatSession["zones"][string] {
  return { id, name: id }
}

function placedIn(zoneId: string): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId: "c" }, zoneId }
}

describe("isRosterFullyPlaced", () => {
  it("is true when no zones are defined (unzoned encounter)", () => {
    expect(isRosterFullyPlaced([placedIn("")], {})).toBe(true)
  })

  it("is true when every combatant sits in an existing zone", () => {
    const zones = { "zone-a": zone("zone-a"), "zone-b": zone("zone-b") }
    expect(
      isRosterFullyPlaced([placedIn("zone-a"), placedIn("zone-b")], zones)
    ).toBe(true)
  })

  it("is false when a combatant is unplaced while zones exist", () => {
    const zones = { "zone-a": zone("zone-a") }
    expect(isRosterFullyPlaced([placedIn("zone-a"), placedIn("")], zones)).toBe(
      false
    )
  })

  it("is false when a combatant references a zone that no longer exists", () => {
    const zones = { "zone-a": zone("zone-a") }
    expect(isRosterFullyPlaced([placedIn("zone-gone")], zones)).toBe(false)
  })
})

function combatant(
  id: string,
  zoneId: string,
  engagement?: CombatantSetup["engagement"]
): CombatantSetup {
  return {
    id,
    side: "players",
    ref: { kind: "pc", characterId: id },
    zoneId,
    engagement,
  }
}

describe("normalizeEngagements", () => {
  it("keeps an engagement between two combatants in the same zone", () => {
    const roster = [
      combatant("a", "zone-a", {
        status: "engaged",
        targetCombatantIds: ["b"],
      }),
      combatant("b", "zone-a"),
    ]
    expect(normalizeEngagements(roster)[0]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["b"],
    })
  })

  it("clears an engagement when the target moved to another zone", () => {
    const roster = [
      combatant("a", "zone-a", {
        status: "engaged",
        targetCombatantIds: ["b"],
      }),
      combatant("b", "zone-b"),
    ]
    expect(normalizeEngagements(roster)[0]!.engagement).toEqual({
      status: "free",
    })
  })

  it("drops only the cross-zone targets, keeping same-zone ones", () => {
    const roster = [
      combatant("a", "zone-a", {
        status: "engaged",
        targetCombatantIds: ["b", "c"],
      }),
      combatant("b", "zone-a"),
      combatant("c", "zone-b"),
    ]
    expect(normalizeEngagements(roster)[0]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["b"],
    })
  })

  it("drops a target that is no longer in the roster (removed combatant)", () => {
    const roster = [
      combatant("a", "zone-a", {
        status: "engaged",
        targetCombatantIds: ["gone"],
      }),
    ]
    expect(normalizeEngagements(roster)[0]!.engagement).toEqual({
      status: "free",
    })
  })

  it("leaves engagements untouched in an unzoned encounter (all empty zoneId)", () => {
    const roster = [
      combatant("a", "", { status: "engaged", targetCombatantIds: ["b"] }),
      combatant("b", ""),
    ]
    expect(normalizeEngagements(roster)[0]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["b"],
    })
  })

  it("leaves an explicitly Free combatant untouched", () => {
    const roster = [
      combatant("a", "z", { status: "free" }),
      combatant("b", "z"),
    ]
    expect(normalizeEngagements(roster)[0]!.engagement).toEqual({
      status: "free",
    })
  })
})

describe("engageableTargets", () => {
  it("offers every other combatant in the same zone, with labels", () => {
    const roster = [
      combatant("a", "zone-a"),
      combatant("b", "zone-a"),
      combatant("c", "zone-b"),
    ]
    expect(engageableTargets(roster, 0, ["A", "B", "C"])).toEqual([
      { id: "b", label: "B" },
    ])
  })

  it("excludes the combatant itself", () => {
    const roster = [combatant("a", "zone-a"), combatant("b", "zone-a")]
    const ids = engageableTargets(roster, 0, ["A", "B"]).map((t) => t.id)
    expect(ids).not.toContain("a")
  })

  it("is side-agnostic — offers a same-zone ally", () => {
    const ally: CombatantSetup = {
      id: "ally",
      side: "players",
      ref: { kind: "pc", characterId: "ally" },
      zoneId: "zone-a",
    }
    const roster = [combatant("a", "zone-a"), ally]
    expect(engageableTargets(roster, 0, ["A", "Ally"])).toEqual([
      { id: "ally", label: "Ally" },
    ])
  })

  it("offers everyone in an unzoned encounter (all empty zoneId)", () => {
    const roster = [combatant("a", ""), combatant("b", ""), combatant("c", "")]
    expect(
      engageableTargets(roster, 0, ["A", "B", "C"]).map((t) => t.id)
    ).toEqual(["b", "c"])
  })

  it("returns no targets for an out-of-range index", () => {
    const roster = [combatant("a", "z"), combatant("b", "z")]
    expect(engageableTargets(roster, 5, ["A", "B"])).toEqual([])
  })

  it("skips a same-zone combatant that has no id (can't be a target)", () => {
    const idless: CombatantSetup = {
      side: "players",
      ref: { kind: "pc", characterId: "x" },
      zoneId: "z",
    }
    const roster = [combatant("a", "z"), idless]
    expect(engageableTargets(roster, 0, ["A", "X"])).toEqual([])
  })
})

describe("setEngagementTargets", () => {
  it("engages both sides when A is engaged with B (mutual)", () => {
    const roster = [combatant("a", "z"), combatant("b", "z")]
    const next = setEngagementTargets(roster, "a", ["b"])
    expect(next[0]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["b"],
    })
    expect(next[1]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["a"],
    })
  })

  it("clears both sides when the link is removed", () => {
    const roster = [
      combatant("a", "z", { status: "engaged", targetCombatantIds: ["b"] }),
      combatant("b", "z", { status: "engaged", targetCombatantIds: ["a"] }),
    ]
    const next = setEngagementTargets(roster, "a", [])
    expect(next[0]!.engagement).toEqual({ status: "free" })
    expect(next[1]!.engagement).toEqual({ status: "free" })
  })

  it("only drops the edited link, leaving the target's other links intact", () => {
    // b is engaged with both a and c; a drops b → b keeps c.
    const roster = [
      combatant("a", "z", { status: "engaged", targetCombatantIds: ["b"] }),
      combatant("b", "z", {
        status: "engaged",
        targetCombatantIds: ["a", "c"],
      }),
      combatant("c", "z", { status: "engaged", targetCombatantIds: ["b"] }),
    ]
    const next = setEngagementTargets(roster, "a", [])
    expect(next[0]!.engagement).toEqual({ status: "free" })
    expect(next[1]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c"],
    })
  })

  it("mirrors a multi-target engagement onto each target", () => {
    const roster = [
      combatant("a", "z"),
      combatant("b", "z"),
      combatant("c", "z"),
    ]
    const next = setEngagementTargets(roster, "a", ["b", "c"])
    expect(next[1]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["a"],
    })
    expect(next[2]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["a"],
    })
  })

  it("clears a non-first combatant's link on both sides", () => {
    const roster = [
      combatant("a", "z", { status: "engaged", targetCombatantIds: ["b"] }),
      combatant("b", "z", { status: "engaged", targetCombatantIds: ["a"] }),
    ]
    // Edit the *second* combatant — exercises that prev is read from the edited
    // combatant, not whichever happens to be first.
    const next = setEngagementTargets(roster, "b", [])
    expect(next.find((s) => s.id === "b")!.engagement).toEqual({
      status: "free",
    })
    expect(next.find((s) => s.id === "a")!.engagement).toEqual({
      status: "free",
    })
  })

  it("leaves an unaffected bystander's engagement untouched", () => {
    // c has no engagement at all; editing a↔b must not stamp it to Free.
    const roster = [
      combatant("a", "z"),
      combatant("b", "z"),
      combatant("c", "z"),
    ]
    const next = setEngagementTargets(roster, "a", ["b"])
    expect(next.find((s) => s.id === "c")!.engagement).toBeUndefined()
  })

  it("does not crash when the edited combatant is not in the roster", () => {
    const roster = [combatant("a", "z"), combatant("b", "z")]
    expect(() => setEngagementTargets(roster, "ghost", [])).not.toThrow()
  })
})
