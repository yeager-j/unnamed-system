import { describe, expect, it } from "vitest"

import { goblin } from "@workspace/game/data/enemies/5e/humanoid/goblin"
import { projectPlayerSnapshot } from "@workspace/game/engine/encounter/player-snapshot"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import {
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

function sequentialIds() {
  let n = 0
  return () => `c-${n++}`
}

function pc(characterId: string, zoneId = ""): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId }
}

function catalogEnemy(enemyKey: string, zoneId = ""): CombatantSetup {
  return { side: "enemies", ref: { kind: "catalog-enemy", enemyKey }, zoneId }
}

function inlineEnemy(zoneId = ""): CombatantSetup {
  return {
    side: "enemies",
    ref: {
      kind: "enemy",
      statBlock: {
        name: "Brigand",
        maxHP: 20,
        currentHP: 12,
        maxSP: 8,
        currentSP: 5,
        attributes: { strength: 2, magic: 0, agility: 1, luck: 0 },
      },
    },
    zoneId,
  }
}

const ARIA: PcCombatantDetail = {
  id: "char-aria",
  name: "Aria",
  pronouns: "she/her",
  portraitUrl: null,
  level: 4,
  currentHP: 18,
  maxHP: 30,
  currentSP: 6,
  maxSP: 12,
  attributes: { strength: 3, magic: 5, agility: 2, luck: 1 },
  affinityChart: { fire: "weak" } as PcCombatantDetail["affinityChart"],
  activeArchetypeKey: null,
  vitalsVersion: 0,
}

function encounter(session: CombatSession, status: "draft" | "live" | "ended") {
  return {
    name: "Ambush at the Bridge",
    status,
    campaignShortId: "camp-1",
    session,
  }
}

describe("projectPlayerSnapshot", () => {
  it("redacts enemy attributes and affinities entirely (UNN-324)", () => {
    const session = createCombatSession(
      [pc("char-aria"), catalogEnemy("goblin")],
      sequentialIds()
    )

    const snapshot = projectPlayerSnapshot(encounter(session, "live"), {
      "char-aria": ARIA,
    })

    const enemy = snapshot.combatants.find((c) => c.kind === "enemy")!
    expect("attributes" in enemy).toBe(false)
    expect("affinities" in enemy).toBe(false)
    // The source definition carries both — proving the absence is redaction.
    expect(goblin.attributes).toBeDefined()
    expect(goblin.affinities).toBeDefined()
  })

  it("keeps PC HP, SP, and attributes fully visible (UNN-324)", () => {
    const session = createCombatSession([pc("char-aria")], sequentialIds())

    const snapshot = projectPlayerSnapshot(encounter(session, "live"), {
      "char-aria": ARIA,
    })

    const player = snapshot.combatants.find((c) => c.kind === "pc")!
    expect(player).toMatchObject({
      kind: "pc",
      hp: { current: 18, max: 30 },
      sp: { current: 6, max: 12 },
      attributes: { strength: 3, magic: 5, agility: 2, luck: 1 },
    })
  })

  it("resolves a catalog enemy's HP to its definition max and gives it no SP", () => {
    const session = createCombatSession(
      [catalogEnemy("goblin")],
      sequentialIds()
    )

    const [enemy] = projectPlayerSnapshot(
      encounter(session, "live"),
      {}
    ).combatants
    expect(enemy).toMatchObject({
      kind: "enemy",
      name: "Goblin",
      hp: { current: goblin.maxHP, max: goblin.maxHP },
      sp: null,
    })
  })

  it("carries an inline enemy's working HP and SP off its stat block", () => {
    const session = createCombatSession([inlineEnemy()], sequentialIds())

    const [enemy] = projectPlayerSnapshot(
      encounter(session, "live"),
      {}
    ).combatants
    expect(enemy).toMatchObject({
      kind: "enemy",
      name: "Brigand",
      hp: { current: 12, max: 20 },
      sp: { current: 5, max: 8 },
    })
  })

  it("lists combatants in session order with acted + current flags", () => {
    const base = createCombatSession(
      [pc("char-aria"), catalogEnemy("goblin")],
      sequentialIds()
    )
    const session: CombatSession = {
      ...base,
      currentActorId: "c-0",
      combatants: base.combatants.map((combatant, index) =>
        index === 1 ? { ...combatant, hasActedThisRound: true } : combatant
      ),
    }

    const snapshot = projectPlayerSnapshot(encounter(session, "live"), {
      "char-aria": ARIA,
    })

    expect(snapshot.combatants.map((c) => c.id)).toEqual(["c-0", "c-1"])
    expect(snapshot.combatants[0]).toMatchObject({
      isCurrent: true,
      hasActed: false,
    })
    expect(snapshot.combatants[1]).toMatchObject({
      isCurrent: false,
      hasActed: true,
    })
  })

  it("resolves engagement target ids to names; Free combatants list none", () => {
    const base = createCombatSession(
      [pc("char-aria"), catalogEnemy("goblin")],
      sequentialIds()
    )
    // c-0 (Aria) engaged with c-1 (Goblin); the Goblin is left Free.
    const session: CombatSession = {
      ...base,
      combatants: base.combatants.map((combatant) =>
        combatant.id === "c-0"
          ? {
              ...combatant,
              engagement: {
                status: "engaged" as const,
                targetCombatantIds: ["c-1"],
              },
            }
          : combatant
      ),
    }

    const { combatants } = projectPlayerSnapshot(encounter(session, "live"), {
      "char-aria": ARIA,
    })

    expect(combatants[0]!.engagedWith).toEqual(["Goblin"])
    expect(combatants[1]!.engagedWith).toEqual([])
  })

  it("resolves the current actor's name + side, or null when none is acting", () => {
    const base = createCombatSession([pc("char-aria")], sequentialIds())

    const live: CombatSession = { ...base, currentActorId: "c-0" }
    expect(
      projectPlayerSnapshot(encounter(live, "live"), { "char-aria": ARIA })
        .currentActor
    ).toEqual({ id: "c-0", name: "Aria", side: "players" })

    expect(
      projectPlayerSnapshot(encounter(base, "live"), { "char-aria": ARIA })
        .currentActor
    ).toBeNull()
  })

  it("passes through status, name, round, and the ordered zone list", () => {
    const base = createCombatSession([pc("char-aria", "z1")], sequentialIds())
    const session: CombatSession = {
      ...base,
      round: 3,
      zones: {
        z1: { id: "z1", name: "Bridge" },
        z2: { id: "z2", name: "Riverbank" },
      },
    }

    const snapshot = projectPlayerSnapshot(encounter(session, "ended"), {
      "char-aria": ARIA,
    })

    expect(snapshot.status).toBe("ended")
    expect(snapshot.name).toBe("Ambush at the Bridge")
    expect(snapshot.campaignShortId).toBe("camp-1")
    expect(snapshot.round).toBe(3)
    expect(snapshot.zones.map((z) => z.id)).toEqual(["z1", "z2"])
  })
})
