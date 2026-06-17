import { describe, expect, it } from "vitest"

import {
  createCombatSession,
  createMapInstance,
  toCombatantSetup,
} from "@workspace/game/engine/encounter/session-factory"
import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/foundation/character/state"
import { mapInstanceStateSchema } from "@workspace/game/foundation/encounter/map-instance"
import {
  combatSessionSchema,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

const SETUP: CombatantSetup[] = [
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-1" },
    zoneId: "zone-a",
  },
  {
    side: "enemies",
    ref: {
      kind: "enemy",
      statBlock: {
        name: "Shadow",
        maxHP: 30,
        currentHP: 30,
        maxSP: 10,
        currentSP: 10,
        attributes: { strength: 4, magic: 2, agility: 5, luck: 1 },
      },
    },
    zoneId: "zone-b",
  },
]

/** Deterministic ids so id-shape assertions don't depend on randomUUID. */
function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

describe("combatSessionSchema", () => {
  it("round-trips a representative (non-spatial) session through JSON", () => {
    const session: CombatSession = {
      round: 2,
      currentActorId: "c-1",
      advantage: "players",
      firstSide: "players",
      combatants: [
        {
          id: "c-1",
          side: "players",
          ref: { kind: "pc", characterId: "char-1" },
          ailments: ["burn"],
          battleConditions: {
            attack: "increased",
            defense: "neutral",
            hitEvasion: "decreased",
            charged: true,
            concentrating: false,
          },
          hasActedThisRound: true,
          moveAvailable: false,
          standardAvailable: false,
          reactionAvailable: false,
          conditionDurations: { attack: 3, defense: 1 },
          counters: {},
        },
        {
          id: "c-2",
          side: "enemies",
          ref: {
            kind: "enemy",
            statBlock: {
              name: "Shadow",
              maxHP: 30,
              currentHP: 18,
              maxSP: 10,
              currentSP: 10,
              attributes: { strength: 4, magic: 2, agility: 5, luck: 1 },
              notes: "weak to fire",
            },
          },
          ailments: [],
          battleConditions: DEFAULT_BATTLE_CONDITIONS,
          hasActedThisRound: false,
          moveAvailable: true,
          standardAvailable: true,
          reactionAvailable: true,
          conditionDurations: {},
          counters: { lumina: 2 },
        },
      ],
    }

    const roundTripped = combatSessionSchema.parse(
      JSON.parse(JSON.stringify(session))
    )
    expect(roundTripped).toEqual(session)
  })

  it("defaults moveAvailable/standardAvailable to true for a pre-UNN-310 blob", () => {
    // A session persisted before the action-economy fields existed must still
    // parse: the `.default(true)` fills them so no data migration is needed.
    const legacyCombatant = {
      id: "c-1",
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      ailments: [],
      battleConditions: DEFAULT_BATTLE_CONDITIONS,
      hasActedThisRound: false,
      reactionAvailable: true,
      conditionDurations: {},
    }
    const legacySession = {
      round: 1,
      currentActorId: null,
      advantage: null,
      firstSide: null,
      combatants: [legacyCombatant],
    }

    const parsed = combatSessionSchema.parse(legacySession)

    expect(parsed.combatants[0]!.moveAvailable).toBe(true)
    expect(parsed.combatants[0]!.standardAvailable).toBe(true)
  })
})

describe("createCombatSession", () => {
  it("yields a valid initial session", () => {
    const session = createCombatSession(sequentialIds())(SETUP)
    expect(combatSessionSchema.safeParse(session).success).toBe(true)
    expect(session.round).toBe(1)
    expect(session.currentActorId).toBeNull()
    expect(session.advantage).toBeNull()
    expect(session.firstSide).toBeNull()
    expect(session.combatants).toHaveLength(2)
  })

  it("mints a stable id per combatant and starts everyone fresh", () => {
    const session = createCombatSession(sequentialIds())(SETUP)
    expect(session.combatants.map((c) => c.id)).toEqual([
      "combatant-0",
      "combatant-1",
    ])
    for (const combatant of session.combatants) {
      expect(combatant.ailments).toEqual([])
      expect(combatant.battleConditions).toEqual(DEFAULT_BATTLE_CONDITIONS)
      expect(combatant.hasActedThisRound).toBe(false)
      expect(combatant.moveAvailable).toBe(true)
      expect(combatant.standardAvailable).toBe(true)
      expect(combatant.reactionAvailable).toBe(true)
      expect(combatant.conditionDurations).toEqual({})
    }
  })

  it("accepts a catalog enemy ref as a stable pointer", () => {
    const session = createCombatSession(sequentialIds())([
      {
        side: "enemies",
        ref: { kind: "catalog-enemy", enemyKey: "goblin" },
        zoneId: "zone-b",
      },
    ])
    expect(combatSessionSchema.safeParse(session).success).toBe(true)
    expect(session.combatants[0]!.ref).toEqual({
      kind: "catalog-enemy",
      enemyKey: "goblin",
    })
  })

  it("honors a setup-supplied id over the minted fallback (UNN-301)", () => {
    const session = createCombatSession(sequentialIds())([
      { ...SETUP[0]!, id: "stable-a" },
      SETUP[1]!, // no id → falls back to newId
    ])
    expect(session.combatants[0]!.id).toBe("stable-a")
    expect(session.combatants[1]!.id).toBe("combatant-0")
  })
})

describe("createMapInstance", () => {
  it("builds occupancy keyed by combatant id, carrying zone + engagement", () => {
    const instance = createMapInstance(sequentialIds())([
      { ...SETUP[0]!, id: "a" },
      {
        ...SETUP[1]!,
        id: "b",
        engagement: { status: "engaged", targetCombatantIds: ["a"] },
      },
    ])

    expect(mapInstanceStateSchema.safeParse(instance).success).toBe(true)
    expect(instance.occupancy).toEqual({
      a: { zoneId: "zone-a", engagement: { status: "free" } },
      b: {
        zoneId: "zone-b",
        engagement: { status: "engaged", targetCombatantIds: ["a"] },
      },
    })
    // Geometry + enchantment are authored ad hoc, empty at mint.
    expect(instance.zones).toEqual({})
    expect(instance.adjacency).toEqual({})
    expect(instance.enchantment).toBeNull()
  })

  it("yields a blank Instance for an empty roster (the create-action shape)", () => {
    const instance = createMapInstance(sequentialIds())([])
    expect(instance.occupancy).toEqual({})
    expect(instance.zones).toEqual({})
  })
})

describe("toCombatantSetup", () => {
  it("round-trips ids + engagement through session + Instance so refs survive a re-save", () => {
    const roster: CombatantSetup[] = [
      { ...SETUP[0]!, id: "a" },
      {
        ...SETUP[1]!,
        id: "b",
        engagement: { status: "engaged", targetCombatantIds: ["a"] },
      },
    ]
    const session = createCombatSession(sequentialIds())(roster)
    const instance = createMapInstance(sequentialIds())(roster)

    const reseeded = session.combatants.map((c) =>
      toCombatantSetup(c, instance.occupancy[c.id])
    )
    const second = createCombatSession(sequentialIds())(reseeded)
    const secondInstance = createMapInstance(sequentialIds())(reseeded)

    expect(second.combatants.map((c) => c.id)).toEqual(["a", "b"])
    expect(secondInstance.occupancy["b"]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["a"],
    })
    expect(secondInstance.occupancy["a"]!.zoneId).toBe("zone-a")
  })

  it("defaults an unplaced combatant (no token) to empty zone + Free", () => {
    const session = createCombatSession(sequentialIds())([
      { ...SETUP[0]!, id: "a" },
    ])

    const setup = toCombatantSetup(session.combatants[0]!, undefined)

    expect(setup.zoneId).toBe("")
    expect(setup.engagement).toBeUndefined()
  })
})

describe("combatSessionSchema rejects malformed sessions", () => {
  const base = (): CombatSession => createCombatSession(sequentialIds())(SETUP)

  it("rejects an unknown side", () => {
    const session = base()
    session.combatants[0]!.side = "neutral" as never
    expect(combatSessionSchema.safeParse(session).success).toBe(false)
  })

  it("rejects a non-positive round", () => {
    const session = base()
    session.round = 0
    expect(combatSessionSchema.safeParse(session).success).toBe(false)
  })

  it("rejects a combatant ref missing its discriminant", () => {
    const session = base()
    session.combatants[0]!.ref = { characterId: "x" } as never
    expect(combatSessionSchema.safeParse(session).success).toBe(false)
  })

  it("rejects a non-positive duration", () => {
    const session = base()
    session.combatants[0]!.conditionDurations = { attack: 0 }
    expect(combatSessionSchema.safeParse(session).success).toBe(false)
  })
})
