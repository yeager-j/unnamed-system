import { describe, expect, it } from "vitest"

import {
  eligibleCombatants,
  nextDraftingSide,
  pendingCombatants,
} from "./selectors"
import {
  createCombatSession,
  type CombatAdvantage,
  type CombatantSetup,
  type CombatSession,
  type CombatSide,
} from "./session"

const SETUP: CombatantSetup[] = [
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-1" },
    zoneId: "zone-a",
  },
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-2" },
    zoneId: "zone-a",
  },
  {
    side: "enemies",
    ref: { kind: "pc", characterId: "char-3" },
    zoneId: "zone-b",
  },
]

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

function pc(side: CombatSide): CombatantSetup {
  return { side, ref: { kind: "pc", characterId: "x" }, zoneId: "z" }
}

/** combatant-0..1 players, combatant-2..3 enemies. */
const FOUR: CombatantSetup[] = [
  pc("players"),
  pc("players"),
  pc("enemies"),
  pc("enemies"),
]
/** combatant-0..2 players, combatant-3 the lone enemy. */
const THREE_ONE: CombatantSetup[] = [
  pc("players"),
  pc("players"),
  pc("players"),
  pc("enemies"),
]

function build(opts: {
  setup: CombatantSetup[]
  firstSide?: CombatSide
  advantage?: CombatAdvantage
  round?: number
  acted?: string[]
}): CombatSession {
  const base = createCombatSession(opts.setup, sequentialIds())
  const acted = new Set(opts.acted ?? [])
  return {
    ...base,
    firstSide: opts.firstSide ?? "players",
    advantage: opts.advantage ?? "neutral",
    round: opts.round ?? 1,
    combatants: base.combatants.map((c) =>
      acted.has(c.id) ? { ...c, hasActedThisRound: true } : c
    ),
  }
}

describe("pendingCombatants", () => {
  it("returns everyone when no one has acted and none are Fallen", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const pending = pendingCombatants(session, new Set())

    expect(pending.map((c) => c.id)).toEqual([
      "combatant-0",
      "combatant-1",
      "combatant-2",
    ])
  })

  it("excludes combatants who have already acted this round", () => {
    const fresh = createCombatSession(SETUP, sequentialIds())
    const session = {
      ...fresh,
      combatants: fresh.combatants.map((c, i) =>
        i === 0 ? { ...c, hasActedThisRound: true } : c
      ),
    }

    const pending = pendingCombatants(session, new Set())

    expect(pending.map((c) => c.id)).toEqual(["combatant-1", "combatant-2"])
  })

  it("excludes Fallen combatants by injected id", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const pending = pendingCombatants(session, new Set(["combatant-1"]))

    expect(pending.map((c) => c.id)).toEqual(["combatant-0", "combatant-2"])
  })

  it("excludes a combatant that is both acted and Fallen without double-counting", () => {
    const fresh = createCombatSession(SETUP, sequentialIds())
    const session = {
      ...fresh,
      combatants: fresh.combatants.map((c, i) =>
        i === 0 ? { ...c, hasActedThisRound: true } : c
      ),
    }

    const pending = pendingCombatants(
      session,
      new Set(["combatant-0", "combatant-2"])
    )

    expect(pending.map((c) => c.id)).toEqual(["combatant-1"])
  })
})

const NONE = new Set<string>()

describe("nextDraftingSide", () => {
  it("returns the lead side first when no one has acted", () => {
    const session = build({ setup: FOUR, firstSide: "players" })
    expect(nextDraftingSide(session, NONE)).toBe("players")
  })

  it("alternates to the other side after the lead acts", () => {
    const session = build({
      setup: FOUR,
      firstSide: "players",
      acted: ["combatant-0"],
    })
    expect(nextDraftingSide(session, NONE)).toBe("enemies")
  })

  it("returns the lead side again once both sides are even", () => {
    const session = build({
      setup: FOUR,
      firstSide: "players",
      acted: ["combatant-0", "combatant-2"],
    })
    expect(nextDraftingSide(session, NONE)).toBe("players")
  })

  it("finishes the unexhausted side back-to-back", () => {
    // 3 players vs 1 enemy: one player + the only enemy have acted; players finish.
    const session = build({
      setup: THREE_ONE,
      firstSide: "players",
      acted: ["combatant-0", "combatant-3"],
    })
    expect(nextDraftingSide(session, NONE)).toBe("players")
  })

  it("keeps drafting the advantaged side through the round-1 opening phase", () => {
    // advantage=enemies, one enemy already acted: normal alternation would flip to
    // players, but the opening phase keeps enemies until they are exhausted.
    const session = build({
      setup: FOUR,
      firstSide: "enemies",
      advantage: "enemies",
      acted: ["combatant-2"],
    })
    expect(nextDraftingSide(session, NONE)).toBe("enemies")
  })

  it("hands off to the other side once the advantaged side is exhausted", () => {
    const session = build({
      setup: FOUR,
      firstSide: "enemies",
      advantage: "enemies",
      acted: ["combatant-2", "combatant-3"],
    })
    expect(nextDraftingSide(session, NONE)).toBe("players")
  })

  it("keeps the same lead side in round 2 (no per-round flip)", () => {
    const session = build({ setup: FOUR, firstSide: "players", round: 2 })
    expect(nextDraftingSide(session, NONE)).toBe("players")
  })

  it("ignores advantage after round 1", () => {
    const session = build({
      setup: FOUR,
      firstSide: "players",
      advantage: "enemies",
      round: 2,
    })
    expect(nextDraftingSide(session, NONE)).toBe("players")
  })

  it("treats a side with only Fallen/acted combatants as exhausted", () => {
    // combatant-1 acted, combatant-0 fell before acting → players have no eligible.
    const session = build({
      setup: FOUR,
      firstSide: "players",
      acted: ["combatant-1"],
    })
    expect(nextDraftingSide(session, new Set(["combatant-0"]))).toBe("enemies")
  })
})

describe("eligibleCombatants", () => {
  it("returns the ordered, non-Fallen picks on the drafting side only", () => {
    const session = build({ setup: FOUR, firstSide: "players" })
    expect(eligibleCombatants(session, NONE).map((c) => c.id)).toEqual([
      "combatant-0",
      "combatant-1",
    ])
  })

  it("excludes a Fallen combatant on the drafting side", () => {
    const session = build({ setup: FOUR, firstSide: "players" })
    expect(
      eligibleCombatants(session, new Set(["combatant-1"])).map((c) => c.id)
    ).toEqual(["combatant-0"])
  })
})
