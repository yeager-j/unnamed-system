import { describe, expect, it } from "vitest"

import {
  enemyStatblocks,
  makeConnection,
  makeEncounter,
  makeGeometry,
  makeZone,
  reduceInstance,
} from "@workspace/game/engine/__fixtures__/encounter"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { makeAttackSkill } from "@workspace/game/engine/__fixtures__/skills"
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
  type MapInstanceState,
  type MapToken,
} from "@workspace/game/foundation/encounter/map-instance"
import {
  type Combatant,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

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
  className: null,
  skills: [],
  activeMechanic: null,
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
 *  inline Cave Bat — both enemies. Ids are explicit so the session roster and the
 *  Instance occupancy agree. */
const SETUP: CombatantSetup[] = [
  {
    id: "combatant-0",
    side: "players",
    ref: { kind: "pc", characterId: "char-roan" },
    zoneId: "z",
  },
  {
    id: "combatant-1",
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "z",
  },
  {
    id: "combatant-2",
    side: "enemies",
    ref: { kind: "enemy", statBlock: CAVE_BAT_STAT_BLOCK },
    zoneId: "z",
  },
]

const PC_DETAIL: Record<string, PcCombatantDetail> = { "char-roan": ROAN }

/** A fixture catalog whose "goblin" carries the name, a positive definition max
 *  HP, an affinity chart, and freeform abilities the detail shaper reads — all
 *  opaque values assigned here, not the shipped creature's. */
const CATALOG = makeTestGameData({
  enemies: [
    makeEnemy({
      key: "goblin",
      name: "Goblin",
      maxHP: 16,
      affinities: { fire: "weak" },
      abilities: "Nimble Escape.",
    }),
  ],
})

/** Resolved enemy statblocks for {@link SETUP}'s catalog goblin (the inline Cave
 *  Bat and PCs don't read from this map). */
const ENEMY_SB = enemyStatblocks(SETUP, CATALOG)

/** The session + its Instance for {@link SETUP}, with the opening declaration the
 *  rail tests assume. */
function build(): { session: CombatSession; instance: MapInstanceState } {
  const { session, instance } = makeEncounter(SETUP)
  return {
    session: { ...session, advantage: "neutral", firstSide: "players" },
    instance,
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

/** Patches one combatant's Instance occupancy token (its zone / engagement). */
function withOccupant(
  instance: MapInstanceState,
  id: string,
  patch: Partial<MapToken>
): MapInstanceState {
  const token = instance.occupancy[id] ?? {
    zoneId: "",
    engagement: { status: "free" },
  }
  return {
    ...instance,
    occupancy: { ...instance.occupancy, [id]: { ...token, ...patch } },
  }
}

describe("buildRosterView", () => {
  it("groups by side in session order with enemy counts", () => {
    const { session, instance } = build()
    const view = buildRosterView(session, instance, PC_DETAIL, ENEMY_SB)

    expect(view.players.map((r) => r.name)).toEqual(["Roan Vale"])
    expect(view.enemies.map((r) => r.name)).toEqual(["Goblin", "Cave Bat"])
    expect(view.enemyCount).toBe(2)
    expect(view.downedEnemyCount).toBe(0)
  })

  it("resolves the rail row's zone display name, not the raw id", () => {
    const { session, instance } = build()
    const placed: MapInstanceState = {
      ...instance,
      geometry: makeGeometry([makeZone("z", { name: "Courtyard" })]),
    }
    expect(
      buildRosterView(session, placed, PC_DETAIL, ENEMY_SB).players[0]!.zoneName
    ).toBe("Courtyard")
  })

  it("leaves zoneName null when the combatant is unplaced / unzoned", () => {
    const { session, instance } = build()
    expect(
      buildRosterView(session, instance, PC_DETAIL, ENEMY_SB).players[0]!
        .zoneName
    ).toBeNull()
  })

  it("gives a PC HP + SP and its portrait", () => {
    const { session, instance } = build()
    const pc = buildRosterView(session, instance, PC_DETAIL, ENEMY_SB)
      .players[0]!
    expect(pc.hp).toEqual({ current: 18, max: 30 })
    expect(pc.sp).toEqual({ current: 8, max: 12 })
    expect(pc.portraitUrl).toBe("https://example.com/roan.png")
  })

  it("gives enemies HP only (no SP, no portrait)", () => {
    const { session, instance } = build()
    const [goblin, caveBat] = buildRosterView(
      session,
      instance,
      PC_DETAIL,
      ENEMY_SB
    ).enemies
    expect(goblin!.sp).toBeNull()
    expect(goblin!.portraitUrl).toBeNull()
    expect(caveBat!.sp).toBeNull()
  })

  it("reads an inline enemy's real current/max HP", () => {
    const { session, instance } = build()
    const caveBat = buildRosterView(session, instance, PC_DETAIL, ENEMY_SB)
      .enemies[1]!
    expect(caveBat.hp).toEqual({ current: 5, max: 8 })
  })

  it("renders a catalog enemy at full HP until its working HP is set", () => {
    const { session, instance } = build()
    const goblin = buildRosterView(session, instance, PC_DETAIL, ENEMY_SB)
      .enemies[0]!
    expect(goblin.hp.current).toBe(goblin.hp.max)
    expect(goblin.hp.max).toBeGreaterThan(0)
  })

  it("reflects a catalog enemy's adjusted working HP off the ref", () => {
    const { session, instance } = build()
    const patched = withCombatant(session, "combatant-1", {
      ref: { kind: "catalog-enemy", enemyKey: "goblin", currentHP: 2 },
    })
    const goblin = buildRosterView(patched, instance, PC_DETAIL, ENEMY_SB)
      .enemies[0]!
    expect(goblin.hp.current).toBe(2)
    expect(goblin.hp.max).toBeGreaterThan(2)
  })

  it("flags Downed and rolls it up across the enemies group", () => {
    const { session, instance } = build()
    const downed = withCombatant(session, "combatant-2", {
      ailments: ["downed"],
    })
    const view = buildRosterView(downed, instance, PC_DETAIL, ENEMY_SB)

    expect(view.enemies[1]!.isDowned).toBe(true)
    expect(view.downedEnemyCount).toBe(1)
  })

  it("flags the acted and the acting combatant", () => {
    const { session, instance } = build()
    let next = withCombatant(session, "combatant-0", {
      hasActedThisRound: true,
    })
    next = { ...next, currentActorId: "combatant-1" }
    const view = buildRosterView(next, instance, PC_DETAIL, ENEMY_SB)

    expect(view.players[0]!.hasActed).toBe(true)
    expect(view.enemies[0]!.isCurrent).toBe(true)
    // A non-acting combatant is not flagged current.
    expect(view.players[0]!.isCurrent).toBe(false)
  })

  it("marks a PC with no current HP as Fallen via the injected detail", () => {
    const { session, instance } = build()
    const view = buildRosterView(
      session,
      instance,
      { "char-roan": { ...ROAN, currentHP: 0 } },
      ENEMY_SB
    )
    expect(view.players[0]!.isFallen).toBe(true)
  })
})

describe("combatantDetail", () => {
  it("returns null for an unknown combatant", () => {
    const { session, instance } = build()
    expect(
      combatantDetail(session, instance, "nope", PC_DETAIL, ENEMY_SB)
    ).toBeNull()
  })

  it("falls back to defaults for a PC whose detail is absent", () => {
    const { session, instance } = build()
    const detail = combatantDetail(
      session,
      instance,
      "combatant-0",
      {},
      ENEMY_SB
    )!

    expect(detail.kind).toBe("pc")
    if (detail.kind === "pc") {
      expect(detail.vitalsVersion).toBe(0)
      expect(detail.level).toBe(1)
      expect(detail.className).toBeNull()
      expect(detail.pronouns).toBeNull()
      expect(detail.portraitUrl).toBeNull()
      expect(detail.hp).toEqual({ current: 0, max: 0 })
      expect(detail.sp).toEqual({ current: 0, max: 0 })
      expect(detail.attributes).toEqual({
        strength: 0,
        magic: 0,
        agility: 0,
        luck: 0,
      })
      expect(detail.affinities).toEqual({})
    }
  })

  it("surfaces the PC's className from its injected detail", () => {
    const { session, instance } = build()
    const detail = combatantDetail(
      session,
      instance,
      "combatant-0",
      { "char-roan": { ...ROAN, className: "Warrior" } },
      ENEMY_SB
    )!
    if (detail.kind === "pc") expect(detail.className).toBe("Warrior")
  })

  it("defaults an unknown catalog enemy's HP and Attributes to zero", () => {
    const { session, instance } = makeEncounter([
      {
        id: "combatant-0",
        side: "enemies",
        ref: { kind: "catalog-enemy", enemyKey: "not-a-real-enemy" },
        zoneId: "z",
      },
    ])
    const detail = combatantDetail(
      session,
      instance,
      "combatant-0",
      {},
      ENEMY_SB
    )!

    expect(detail.kind).toBe("enemy")
    if (detail.kind === "enemy") {
      expect(detail.hp).toEqual({ current: 0, max: 0 })
      expect(detail.statblock.attributes).toEqual({
        strength: 0,
        magic: 0,
        agility: 0,
        luck: 0,
      })
    }
  })

  it("shapes a PC: identity, vitals, attributes, affinities", () => {
    const { session, instance } = build()
    const detail = combatantDetail(
      session,
      instance,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!

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
    const { session, instance } = build()
    const detail = combatantDetail(
      session,
      instance,
      "combatant-1",
      PC_DETAIL,
      ENEMY_SB
    )!

    expect(detail.kind).toBe("enemy")
    if (detail.kind === "enemy") {
      expect(detail.statblock.level).toBeTypeOf("number")
      expect(detail.statblock.affinities).not.toBeNull()
      expect(detail.hp.current).toBe(detail.hp.max)
      // The Goblin has no skills but carries freeform abilities Markdown.
      expect(detail.statblock.skills).toEqual([])
      expect(detail.statblock.abilities).toBeTypeOf("string")
    }
  })

  it("resolves a catalog enemy's skill keys to display names", () => {
    // A fixture captain whose seeded skills (garu/zio as opaque ids, named
    // distinctly from their keys) roll Magic, so the resolved Attack Roll equals
    // the seeded Magic — behavior, not the shipped creature's balance.
    const captainMagic = 7
    const captainCatalog = makeTestGameData({
      enemies: [
        makeEnemy({
          key: "bandit-captain",
          attributes: { strength: 0, magic: captainMagic, agility: 0, luck: 0 },
          skillKeys: ["garu", "zio"],
        }),
      ],
      skills: [
        makeAttackSkill({
          key: "garu",
          name: "Garu",
          attackRoll: { attribute: "ma", tiers: [] },
        }),
        makeAttackSkill({
          key: "zio",
          name: "Zio",
          attackRoll: { attribute: "ma", tiers: [] },
        }),
      ],
    })
    const { session, instance } = makeEncounter([
      {
        id: "combatant-0",
        side: "enemies",
        ref: { kind: "catalog-enemy", enemyKey: "bandit-captain" },
        zoneId: "z",
      },
    ])
    const detail = combatantDetail(
      session,
      instance,
      "combatant-0",
      PC_DETAIL,
      enemyStatblocks(session.combatants, captainCatalog)
    )!

    expect(detail.kind).toBe("enemy")
    if (detail.kind === "enemy") {
      expect(detail.statblock.skills.map((skill) => skill.key)).toEqual([
        "garu",
        "zio",
      ])
      // Resolved through the skill lookup, never the raw key.
      for (const skill of detail.statblock.skills) {
        expect(skill.name).not.toBe(skill.key)
        expect(skill.name.length).toBeGreaterThan(0)
      }
      // Skills are hydrated against the enemy's flat Attributes (UNN-350 seam):
      // garu/zio roll Magic, so the resolved Attack Roll is the seeded Magic.
      const garu = detail.statblock.skills.find((skill) => skill.key === "garu")
      expect(garu?.resolvedAttackRoll?.total).toBe(captainMagic)
    }
  })

  it("shapes an inline enemy: stat-block attributes, no level, no chart, no skills/abilities", () => {
    const { session, instance } = build()
    const detail = combatantDetail(
      session,
      instance,
      "combatant-2",
      PC_DETAIL,
      ENEMY_SB
    )!

    expect(detail.kind).toBe("enemy")
    if (detail.kind === "enemy") {
      expect(detail.statblock.level).toBeNull()
      expect(detail.statblock.affinities).toBeNull()
      expect(detail.statblock.attributes.agility).toBe(2)
      expect(detail.hp).toEqual({ current: 5, max: 8 })
      expect(detail.statblock.source).toBe("enemy")
      expect(detail.statblock.talents).toEqual([])
      expect(detail.statblock.skills).toEqual([])
      expect(detail.statblock.abilities).toBeNull()
    }
  })

  it("surfaces the editable session overlay off the combatant (enemy)", () => {
    const { session, instance } = build()
    const patched = withCombatant(session, "combatant-2", {
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
      counters: { lumina: 2 },
    })

    const detail = combatantDetail(
      patched,
      instance,
      "combatant-2",
      PC_DETAIL,
      ENEMY_SB
    )!

    expect(detail.ailments).toEqual(["downed", "burn"])
    expect(detail.battleConditions.attack).toBe("increased")
    expect(detail.battleConditions.charged).toBe(true)
    expect(detail.conditionDurations).toEqual({ attack: 3 })
    expect(detail.counters).toEqual({ lumina: 2 })
    expect(detail.actionEconomy).toEqual({
      move: false,
      standard: true,
      reaction: false,
    })
  })

  it("surfaces the overlay for a PC too (identical shape)", () => {
    const { session, instance } = build()
    const detail = combatantDetail(
      session,
      instance,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!
    expect(detail.ailments).toEqual([])
    expect(detail.counters).toEqual({})
    expect(detail.actionEconomy).toEqual({
      move: true,
      standard: true,
      reaction: true,
    })
  })

  it("position is null when the encounter has no zones", () => {
    const { session, instance } = build()
    expect(
      combatantDetail(session, instance, "combatant-0", PC_DETAIL, ENEMY_SB)!
        .position
    ).toBeNull()
  })

  it("position carries the current zone + adjacent targets when placed", () => {
    const { session, instance } = build()
    const placed: MapInstanceState = {
      ...instance,
      geometry: makeGeometry(
        [
          makeZone("z", { name: "Courtyard" }),
          makeZone("z2", { name: "Hall" }),
        ],
        [makeConnection("conn-z-z2", "z", "z2")]
      ),
    }
    // combatant-0 is placed in "z" (the SETUP zoneId).
    const pos = combatantDetail(
      session,
      placed,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!.position!
    expect(pos.current?.name).toBe("Courtyard")
    expect(pos.targets.map((t) => t.name)).toEqual(["Hall"])
  })

  it("position offers all zones when the combatant is unplaced", () => {
    const { session, instance } = build()
    const placed: MapInstanceState = {
      ...instance,
      // combatant-0's "z" isn't a defined zone → unplaced.
      geometry: makeGeometry([
        makeZone("a", { name: "Courtyard" }),
        makeZone("b", { name: "Hall" }),
      ]),
    }
    const pos = combatantDetail(
      session,
      placed,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!.position!
    expect(pos.current).toBeNull()
    expect(pos.targets.map((t) => t.name).sort()).toEqual(["Courtyard", "Hall"])
  })

  it("carries engagement: free value + same-zone candidates", () => {
    // All three SETUP combatants share zoneId "z".
    const { session, instance } = build()
    const eng = combatantDetail(
      session,
      instance,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!.engagement
    expect(eng.value).toEqual({ status: "free" })
    expect(eng.targetNames).toEqual([])
    expect(eng.candidates.map((c) => c.label)).toEqual(["Goblin", "Cave Bat"])
  })

  it("resolves engaged target names on the detail", () => {
    const { session, instance } = build()
    const engaged = withOccupant(instance, "combatant-0", {
      engagement: { status: "engaged", targetCombatantIds: ["combatant-1"] },
    })
    const eng = combatantDetail(
      session,
      engaged,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!.engagement
    expect(eng.value).toEqual({
      status: "engaged",
      targetCombatantIds: ["combatant-1"],
    })
    expect(eng.targetNames).toEqual(["Goblin"])
  })
})

/**
 * M0 safety net (UNN-472): characterizes the shipped `move → reveal-adjacent
 * context` behavior — applying a `moveCombatant` event recomputes the drawer's
 * move targets to the **new** zone's neighbors. This composes the Instance move
 * reducer with the `roster-view` position shaper (which the M0 cutover repoints
 * to read occupancy from the Map Instance), so it must stay green across that
 * lift. The static `position.targets` case lives above; this pins the recompute
 * *through a move*, which nothing else asserts.
 */
describe("combatantDetail — move recomputes the adjacent-zone targets (UNN-472)", () => {
  /** combatant-0 placed in `z` (Courtyard) on a three-zone line
   *  Courtyard ↔ Hall ↔ Cellar. */
  function lineGraph(): { session: CombatSession; instance: MapInstanceState } {
    const { session, instance } = build()
    return {
      session,
      instance: {
        ...instance,
        geometry: makeGeometry(
          [
            makeZone("z", { name: "Courtyard" }),
            makeZone("z2", { name: "Hall" }),
            makeZone("z3", { name: "Cellar" }),
          ],
          [
            makeConnection("conn-z-z2", "z", "z2"),
            makeConnection("conn-z2-z3", "z2", "z3"),
          ]
        ),
      },
    }
  }

  it("offers the start zone's neighbors before the move", () => {
    const { session, instance } = lineGraph()
    const pos = combatantDetail(
      session,
      instance,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!.position!

    expect(pos.current?.name).toBe("Courtyard")
    expect(pos.targets.map((t) => t.name)).toEqual(["Hall"])
  })

  it("recomputes to the destination zone's neighbors after the move", () => {
    const { session, instance } = lineGraph()
    const moved = reduceInstance(instance, {
      kind: "moveCombatant",
      combatantId: "combatant-0",
      toZoneId: "z2",
    })

    const pos = combatantDetail(
      session,
      moved,
      "combatant-0",
      PC_DETAIL,
      ENEMY_SB
    )!.position!

    expect(pos.current?.name).toBe("Hall")
    expect(pos.targets.map((t) => t.name)).toEqual(["Courtyard", "Cellar"])
    expect(pos.targets.map((t) => t.name)).not.toContain("Hall")
  })
})
