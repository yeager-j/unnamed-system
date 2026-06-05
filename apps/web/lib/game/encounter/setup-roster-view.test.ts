import { describe, expect, it } from "vitest"

import type { CombatantSetup, CombatSession } from "./session"
import {
  buildSetupCombatantLabels,
  isRosterFullyPlaced,
  normalizeEngagements,
  setEngagementTargets,
} from "./setup-roster-view"

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
    const labels = buildSetupCombatantLabels(
      [catalogEnemy("goblin"), catalogEnemy("goblin"), catalogEnemy("goblin")],
      {}
    )
    expect(labels).toEqual(["Goblin", "Goblin 2", "Goblin 3"])
  })

  it("leaves a singleton un-numbered", () => {
    expect(buildSetupCombatantLabels([catalogEnemy("goblin")], {})).toEqual([
      "Goblin",
    ])
  })

  it("resolves PC names from the injected map and numbers per base name", () => {
    const labels = buildSetupCombatantLabels(
      [pc("char-1"), catalogEnemy("goblin"), catalogEnemy("goblin")],
      { "char-1": "Brannis" }
    )
    expect(labels).toEqual(["Brannis", "Goblin", "Goblin 2"])
  })

  it("falls back to the raw key when a catalog lookup misses", () => {
    expect(buildSetupCombatantLabels([catalogEnemy("nope")], {})).toEqual([
      "nope",
    ])
  })

  it("is index-aligned to the input", () => {
    const setups = [catalogEnemy("goblin"), pc("char-1")]
    expect(
      buildSetupCombatantLabels(setups, { "char-1": "Roan" })
    ).toHaveLength(setups.length)
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
})
