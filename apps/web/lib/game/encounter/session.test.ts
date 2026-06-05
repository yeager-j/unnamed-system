import { describe, expect, it } from "vitest"

import { DEFAULT_BATTLE_CONDITIONS } from "@/lib/game/character"

import {
  combatSessionSchema,
  createCombatSession,
  toCombatantSetup,
  type CombatantSetup,
  type CombatSession,
} from "./session"

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
  it("round-trips a representative session through JSON", () => {
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
          zoneId: "zone-a",
          engagement: { status: "engaged", targetCombatantIds: ["c-2"] },
          conditionDurations: { attack: 3, defense: 1 },
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
          zoneId: "zone-a",
          engagement: { status: "engaged", targetCombatantIds: ["c-1"] },
          conditionDurations: {},
        },
      ],
      zones: {
        "zone-a": { id: "zone-a", name: "Courtyard", notes: "muddy" },
        "zone-b": { id: "zone-b", name: "Hall" },
      },
      adjacency: {
        "zone-a": ["zone-b"],
        "zone-b": ["zone-a"],
      },
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
      zoneId: "zone-a",
      engagement: { status: "free" },
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
    const session = createCombatSession(SETUP, sequentialIds())
    expect(combatSessionSchema.safeParse(session).success).toBe(true)
    expect(session.round).toBe(1)
    expect(session.currentActorId).toBeNull()
    expect(session.advantage).toBeNull()
    expect(session.firstSide).toBeNull()
    expect(session.combatants).toHaveLength(2)
  })

  it("mints a stable id per combatant and starts everyone fresh", () => {
    const session = createCombatSession(SETUP, sequentialIds())
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
      expect(combatant.engagement).toEqual({ status: "free" })
    }
  })

  it("accepts a catalog enemy ref as a stable pointer", () => {
    const session = createCombatSession(
      [
        {
          side: "enemies",
          ref: { kind: "catalog-enemy", enemyKey: "goblin" },
          zoneId: "zone-b",
        },
      ],
      sequentialIds()
    )
    expect(combatSessionSchema.safeParse(session).success).toBe(true)
    expect(session.combatants[0]!.ref).toEqual({
      kind: "catalog-enemy",
      enemyKey: "goblin",
    })
  })

  it("preserves an explicit engagement from setup", () => {
    const session = createCombatSession(
      [
        {
          ...SETUP[0]!,
          engagement: { status: "engaged", targetCombatantIds: ["x"] },
        },
      ],
      sequentialIds()
    )
    expect(session.combatants[0]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["x"],
    })
  })

  it("honors a setup-supplied id over the minted fallback (UNN-301)", () => {
    const session = createCombatSession(
      [
        { ...SETUP[0]!, id: "stable-a" },
        SETUP[1]!, // no id → falls back to newId
      ],
      sequentialIds()
    )
    expect(session.combatants[0]!.id).toBe("stable-a")
    expect(session.combatants[1]!.id).toBe("combatant-0")
  })

  it("round-trips a stable id through toCombatantSetup so engagement refs survive a re-save", () => {
    const first = createCombatSession(
      [
        { ...SETUP[0]!, id: "a" },
        {
          ...SETUP[1]!,
          id: "b",
          engagement: { status: "engaged", targetCombatantIds: ["a"] },
        },
      ],
      sequentialIds()
    )
    const reseeded = first.combatants.map(toCombatantSetup)
    const second = createCombatSession(reseeded, sequentialIds())

    expect(second.combatants.map((c) => c.id)).toEqual(["a", "b"])
    expect(second.combatants[1]!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["a"],
    })
  })
})

describe("combatSessionSchema rejects malformed sessions", () => {
  const base = (): CombatSession => createCombatSession(SETUP, sequentialIds())

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

  it("rejects a combatant with no zoneId", () => {
    const session = base()
    delete (session.combatants[0] as { zoneId?: string }).zoneId
    expect(combatSessionSchema.safeParse(session).success).toBe(false)
  })

  it("rejects a non-positive duration", () => {
    const session = base()
    session.combatants[0]!.conditionDurations = { attack: 0 }
    expect(combatSessionSchema.safeParse(session).success).toBe(false)
  })

  it("rejects an engaged status with no targets", () => {
    const session = base()
    session.combatants[0]!.engagement = {
      status: "engaged",
      targetCombatantIds: [],
    }
    expect(combatSessionSchema.safeParse(session).success).toBe(false)
  })
})
