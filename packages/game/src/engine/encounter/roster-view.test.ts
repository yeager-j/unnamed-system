import { describe, expect, it } from "vitest"

import { getEnemy } from "@workspace/game/data/enemies/registry"
import {
  buildRosterView,
  combatantDetail,
  type PcCombatantDetail,
} from "@workspace/game/engine/encounter/roster-view"
import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/foundation/character/state"
import {
  DAMAGE_TYPES,
  type Affinity,
  type DamageType,
} from "@workspace/game/foundation/combat/affinity"
import {
  createCombatSession,
  type Combatant,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

/** A full {@link DamageType} chart defaulting to Neutral, matching
 *  `HydratedCharacter.affinityChart`'s required-key shape. */
function neutralChart(
  overrides: Partial<Record<DamageType, Affinity>> = {}
): Record<DamageType, Affinity> {
  const base = Object.fromEntries(
    DAMAGE_TYPES.map((type) => [type, "neutral"])
  ) as Record<DamageType, Affinity>
  return { ...base, ...overrides }
}

const ROAN: PcCombatantDetail = {
  id: "char-roan",
  name: "Roan Vale",
  pronouns: "they/them",
  portraitUrl: "https://example.com/roan.png",
  level: 3,
  currentHP: 18,
  maxHP: 30,
  currentSP: 8,
  maxSP: 12,
  attributes: { strength: 2, magic: 0, agility: 1, luck: -1 },
  affinityChart: neutralChart({ fire: "weak", ice: "resist" }),
  activeArchetypeKey: null,
  vitalsVersion: 4,
}

const CAVE_BAT_STAT_BLOCK = {
  name: "Cave Bat",
  maxHP: 8,
  currentHP: 5,
  maxSP: 0,
  currentSP: 0,
  attributes: { strength: 0, magic: 0, agility: 2, luck: 0 },
}

/** combatant-0 Roan (PC, players), combatant-1 catalog goblin, combatant-2
 *  inline Cave Bat — both enemies. */
const SETUP: CombatantSetup[] = [
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-roan" },
    zoneId: "z",
  },
  {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "z",
  },
  {
    side: "enemies",
    ref: { kind: "enemy", statBlock: CAVE_BAT_STAT_BLOCK },
    zoneId: "z",
  },
]

const PC_DETAIL: Record<string, PcCombatantDetail> = { "char-roan": ROAN }

function build(): CombatSession {
  return {
    ...createCombatSession(SETUP, sequentialIds()),
    advantage: "neutral",
    firstSide: "players",
  }
}

function withCombatant(
  session: CombatSession,
  id: string,
  patch: Partial<Combatant>
): CombatSession {
  return {
    ...session,
    combatants: session.combatants.map((c) =>
      c.id === id ? { ...c, ...patch } : c
    ),
  }
}

describe("buildRosterView", () => {
  it("groups by side in session order with enemy counts", () => {
    const view = buildRosterView(build(), PC_DETAIL)

    expect(view.players.map((r) => r.name)).toEqual(["Roan Vale"])
    expect(view.enemies.map((r) => r.name)).toEqual(["Goblin", "Cave Bat"])
    expect(view.enemyCount).toBe(2)
    expect(view.downedEnemyCount).toBe(0)
  })

  it("resolves the rail row's zone display name, not the raw id", () => {
    const base = build()
    const session: CombatSession = {
      ...base,
      zones: { z: { id: "z", name: "Courtyard" } },
    }
    expect(buildRosterView(session, PC_DETAIL).players[0]!.zoneName).toBe(
      "Courtyard"
    )
  })

  it("leaves zoneName null when the combatant is unplaced / unzoned", () => {
    expect(buildRosterView(build(), PC_DETAIL).players[0]!.zoneName).toBeNull()
  })

  it("gives a PC HP + SP and its portrait", () => {
    const pc = buildRosterView(build(), PC_DETAIL).players[0]!
    expect(pc.hp).toEqual({ current: 18, max: 30 })
    expect(pc.sp).toEqual({ current: 8, max: 12 })
    expect(pc.portraitUrl).toBe("https://example.com/roan.png")
  })

  it("gives enemies HP only (no SP, no portrait)", () => {
    const [goblin, caveBat] = buildRosterView(build(), PC_DETAIL).enemies
    expect(goblin!.sp).toBeNull()
    expect(goblin!.portraitUrl).toBeNull()
    expect(caveBat!.sp).toBeNull()
  })

  it("reads an inline enemy's real current/max HP", () => {
    const caveBat = buildRosterView(build(), PC_DETAIL).enemies[1]!
    expect(caveBat.hp).toEqual({ current: 5, max: 8 })
  })

  it("renders a catalog enemy at full HP until its working HP is set", () => {
    const goblin = buildRosterView(build(), PC_DETAIL).enemies[0]!
    expect(goblin.hp.current).toBe(goblin.hp.max)
    expect(goblin.hp.max).toBeGreaterThan(0)
  })

  it("reflects a catalog enemy's adjusted working HP off the ref", () => {
    const base = build()
    const session: CombatSession = {
      ...base,
      combatants: base.combatants.map((c) =>
        c.id === "combatant-1"
          ? {
              ...c,
              ref: { kind: "catalog-enemy", enemyKey: "goblin", currentHP: 2 },
            }
          : c
      ),
    }
    const goblin = buildRosterView(session, PC_DETAIL).enemies[0]!
    expect(goblin.hp.current).toBe(2)
    expect(goblin.hp.max).toBeGreaterThan(2)
  })

  it("flags Downed and rolls it up across the enemies group", () => {
    const session = withCombatant(build(), "combatant-2", {
      ailments: ["downed"],
    })
    const view = buildRosterView(session, PC_DETAIL)

    expect(view.enemies[1]!.isDowned).toBe(true)
    expect(view.downedEnemyCount).toBe(1)
  })

  it("flags the acted and the acting combatant", () => {
    let session = withCombatant(build(), "combatant-0", {
      hasActedThisRound: true,
    })
    session = { ...session, currentActorId: "combatant-1" }
    const view = buildRosterView(session, PC_DETAIL)

    expect(view.players[0]!.hasActed).toBe(true)
    expect(view.enemies[0]!.isCurrent).toBe(true)
  })
})

describe("combatantDetail", () => {
  it("returns null for an unknown combatant", () => {
    expect(combatantDetail(build(), "nope", PC_DETAIL)).toBeNull()
  })

  it("shapes a PC: identity, vitals, attributes, affinities", () => {
    const detail = combatantDetail(build(), "combatant-0", PC_DETAIL)!

    expect(detail.kind).toBe("pc")
    expect(detail).toMatchObject({
      name: "Roan Vale",
      level: 3,
      pronouns: "they/them",
      className: null, // no active archetype in this fixture
      hp: { current: 18, max: 30 },
    })
    if (detail.kind === "pc") {
      expect(detail.sp).toEqual({ current: 8, max: 12 })
      expect(detail.affinities.fire).toBe("weak")
      expect(detail.attributes.strength).toBe(2)
      // The pools writes need the character-row id + its vitals token.
      expect(detail.characterId).toBe("char-roan")
      expect(detail.vitalsVersion).toBe(4)
    }
  })

  it("shapes a catalog enemy: level + attributes + affinity chart, full HP, abilities", () => {
    const detail = combatantDetail(build(), "combatant-1", PC_DETAIL)!

    expect(detail.kind).toBe("enemy")
    if (detail.kind === "enemy") {
      expect(detail.level).toBeTypeOf("number")
      expect(detail.affinities).not.toBeNull()
      expect(detail.hp.current).toBe(detail.hp.max)
      // The Goblin has no skills but carries freeform abilities Markdown.
      expect(detail.skills).toEqual([])
      expect(detail.abilities).toBeTypeOf("string")
    }
  })

  it("resolves a catalog enemy's skill keys to display names", () => {
    const session = createCombatSession(
      [
        {
          side: "enemies",
          ref: { kind: "catalog-enemy", enemyKey: "bandit-captain" },
          zoneId: "z",
        },
      ],
      sequentialIds()
    )
    const detail = combatantDetail(session, "combatant-0", PC_DETAIL)!

    expect(detail.kind).toBe("enemy")
    if (detail.kind === "enemy") {
      expect(detail.skills.map((skill) => skill.key)).toEqual(["garu", "zio"])
      // Resolved through the skill registry, never the raw key.
      for (const skill of detail.skills) {
        expect(skill.name).not.toBe(skill.key)
        expect(skill.name.length).toBeGreaterThan(0)
      }
      // Skills are hydrated against the enemy's flat Attributes (UNN-350 seam):
      // garu/zio roll Magic, so the resolved Attack Roll is the captain's Magic.
      const magic = getEnemy("bandit-captain")!.attributes.magic
      const garu = detail.skills.find((skill) => skill.key === "garu")
      expect(garu?.resolvedAttackRoll?.total).toBe(magic)
    }
  })

  it("shapes an inline enemy: stat-block attributes, no level, no chart, no skills/abilities", () => {
    const detail = combatantDetail(build(), "combatant-2", PC_DETAIL)!

    expect(detail.kind).toBe("enemy")
    if (detail.kind === "enemy") {
      expect(detail.level).toBeNull()
      expect(detail.affinities).toBeNull()
      expect(detail.attributes.agility).toBe(2)
      expect(detail.hp).toEqual({ current: 5, max: 8 })
      expect(detail.skills).toEqual([])
      expect(detail.abilities).toBeNull()
    }
  })

  it("surfaces the editable session overlay off the combatant (enemy)", () => {
    const session = withCombatant(build(), "combatant-2", {
      ailments: ["downed", "burn"],
      battleConditions: {
        ...DEFAULT_BATTLE_CONDITIONS,
        attack: "increased",
        charged: true,
      },
      conditionDurations: { attack: 3 },
      moveAvailable: false,
      standardAvailable: true,
      reactionAvailable: false,
    })

    const detail = combatantDetail(session, "combatant-2", PC_DETAIL)!

    expect(detail.ailments).toEqual(["downed", "burn"])
    expect(detail.battleConditions.attack).toBe("increased")
    expect(detail.battleConditions.charged).toBe(true)
    expect(detail.conditionDurations).toEqual({ attack: 3 })
    expect(detail.actionEconomy).toEqual({
      move: false,
      standard: true,
      reaction: false,
    })
  })

  it("surfaces the overlay for a PC too (identical shape)", () => {
    const detail = combatantDetail(build(), "combatant-0", PC_DETAIL)!
    expect(detail.ailments).toEqual([])
    expect(detail.actionEconomy).toEqual({
      move: true,
      standard: true,
      reaction: true,
    })
  })

  it("position is null when the encounter has no zones", () => {
    expect(
      combatantDetail(build(), "combatant-0", PC_DETAIL)!.position
    ).toBeNull()
  })

  it("position carries the current zone + adjacent targets when placed", () => {
    const session: CombatSession = {
      ...build(),
      zones: {
        z: { id: "z", name: "Courtyard" },
        z2: { id: "z2", name: "Hall" },
      },
      adjacency: { z: ["z2"], z2: ["z"] },
    }
    // combatant-0 is placed in "z" (the SETUP zoneId).
    const pos = combatantDetail(session, "combatant-0", PC_DETAIL)!.position!
    expect(pos.current?.name).toBe("Courtyard")
    expect(pos.targets.map((t) => t.name)).toEqual(["Hall"])
  })

  it("position offers all zones when the combatant is unplaced", () => {
    const session: CombatSession = {
      ...build(),
      // combatant-0's "z" isn't a defined zone → unplaced.
      zones: {
        a: { id: "a", name: "Courtyard" },
        b: { id: "b", name: "Hall" },
      },
    }
    const pos = combatantDetail(session, "combatant-0", PC_DETAIL)!.position!
    expect(pos.current).toBeNull()
    expect(pos.targets.map((t) => t.name).sort()).toEqual(["Courtyard", "Hall"])
  })

  it("carries engagement: free value + same-zone candidates", () => {
    // All three SETUP combatants share zoneId "z".
    const eng = combatantDetail(build(), "combatant-0", PC_DETAIL)!.engagement
    expect(eng.value).toEqual({ status: "free" })
    expect(eng.targetNames).toEqual([])
    expect(eng.candidates.map((c) => c.label)).toEqual(["Goblin", "Cave Bat"])
  })

  it("resolves engaged target names on the detail", () => {
    const session = withCombatant(build(), "combatant-0", {
      engagement: { status: "engaged", targetCombatantIds: ["combatant-1"] },
    })
    const eng = combatantDetail(session, "combatant-0", PC_DETAIL)!.engagement
    expect(eng.value).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-1"],
    })
    expect(eng.targetNames).toEqual(["Goblin"])
  })
})
