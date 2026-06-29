import { describe, expect, it } from "vitest"

import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

import { makeScene, sessionOf, type SceneSpec } from "./__fixtures__/session"
import { asParticipantId } from "./ids"
import { DEFAULT_TURN_STATE, type OverlayComponents } from "./overlay"
import {
  actionAvailability,
  appendOrdinals,
  eligibleParticipants,
  nextDraftingSide,
  participantDisplayNames,
  participantName,
  pendingParticipants,
} from "./selectors"
import type { Session } from "./session"

/** Overlay override marking a participant as having acted `turns` times. */
function acted(turns = 1): Partial<OverlayComponents> {
  return { turnState: { ...DEFAULT_TURN_STATE, turnsTakenThisRound: turns } }
}

/** Builds a {@link Session} from participant specs (the drafting selectors take no
 *  resolve). */
function buildSession(
  specs: SceneSpec[],
  scalars: Parameters<typeof sessionOf>[1] = {}
): { session: Session } {
  return { session: sessionOf(makeScene(specs).participants, scalars) }
}

/** A resolved Identity read-unit. */
function named(name: string): ResolvedEntity["components"] {
  return { identity: { name } }
}

describe("pendingParticipants (R6 / CD10 — derived acted-flag)", () => {
  it("returns participants that have not acted and are not Fallen, in order", () => {
    const { session } = buildSession([
      { id: "a", side: "players" },
      { id: "b", side: "players", overlay: acted() },
      { id: "c", side: "enemies" },
    ])
    const fallen = new Set([asParticipantId("c")])
    expect(pendingParticipants(session, fallen).map((p) => p.id)).toEqual(["a"])
  })
})

describe("nextDraftingSide (R3.2 lead / CD10 — fewer-acted alternation)", () => {
  it("returns the lead (firstSide) when no one is pending", () => {
    const { session } = buildSession(
      [
        { id: "p", side: "players", overlay: acted() },
        { id: "e", side: "enemies", overlay: acted() },
      ],
      { firstSide: "enemies", round: 2 }
    )
    expect(nextDraftingSide(session, new Set())).toBe("enemies")
  })

  it("skips a side with no eligible participants so the other finishes", () => {
    const { session } = buildSession(
      [
        { id: "p", side: "players", overlay: acted() },
        { id: "e", side: "enemies" },
      ],
      { firstSide: "players", round: 2 }
    )
    expect(nextDraftingSide(session, new Set())).toBe("enemies")
  })

  it("drafts the advantaged side during the round-1 advantage phase", () => {
    const { session } = buildSession(
      [
        { id: "p", side: "players" },
        { id: "e", side: "enemies" },
      ],
      { firstSide: "players", advantage: "enemies", round: 1 }
    )
    expect(nextDraftingSide(session, new Set())).toBe("enemies")
  })

  it("sends the side with fewer acted next (both pending, past the advantage phase)", () => {
    const { session } = buildSession(
      [
        { id: "p1", side: "players", overlay: acted() },
        { id: "p2", side: "players" },
        { id: "e1", side: "enemies" },
      ],
      { firstSide: "players", round: 2 }
    )
    // players acted 1, enemies acted 0 → enemies (fewer acted) goes next.
    expect(nextDraftingSide(session, new Set())).toBe("enemies")
  })

  it("breaks an acted-count tie toward the lead side", () => {
    const { session } = buildSession(
      [
        { id: "p", side: "players" },
        { id: "e", side: "enemies" },
      ],
      { firstSide: "players", round: 2 }
    )
    expect(nextDraftingSide(session, new Set())).toBe("players")
  })
})

describe("eligibleParticipants", () => {
  it("returns the pending participants on the drafting side", () => {
    const { session } = buildSession(
      [
        { id: "p1", side: "players" },
        { id: "p2", side: "players", overlay: acted() },
        { id: "e1", side: "enemies" },
      ],
      { firstSide: "players", round: 2 }
    )
    // players acted 1, enemies acted 0 → drafting side is enemies.
    expect(eligibleParticipants(session, new Set()).map((p) => p.id)).toEqual([
      "e1",
    ])
  })
})

describe("actionAvailability (R11 / CD10 — constant 1/1/1, floored at 0)", () => {
  it("a fresh participant has every action available", () => {
    expect(actionAvailability(DEFAULT_TURN_STATE)).toEqual({
      move: 1,
      standard: 1,
      reaction: 1,
    })
  })

  it("subtracts consumption from the constant budget", () => {
    expect(
      actionAvailability({
        movesUsed: 1,
        standardsUsed: 0,
        reactionsUsed: 1,
        turnsTakenThisRound: 1,
      })
    ).toEqual({ move: 0, standard: 1, reaction: 0 })
  })

  it("floors at 0 when multi-action pushes consumption past the budget", () => {
    expect(
      actionAvailability({
        movesUsed: 3,
        standardsUsed: 2,
        reactionsUsed: 0,
        turnsTakenThisRound: 1,
      })
    ).toEqual({ move: 0, standard: 0, reaction: 1 })
  })
})

describe("participantName (NAME-1 — uniform resolved identity)", () => {
  it("reads the resolved Identity name", () => {
    const { view } = makeScene([{ id: "p1", resolved: named("Aria") }])
    const [id, participantView] = [...view][0]!
    expect(participantName(id, participantView)).toBe("Aria")
  })

  it("falls back to the roster id when no Identity read-unit resolves", () => {
    const { view } = makeScene([{ id: "ghost" }])
    const [id, participantView] = [...view][0]!
    expect(participantName(id, participantView)).toBe("ghost")
  })
})

describe("appendOrdinals (NAME-2)", () => {
  it("keeps a lone name bare and numbers later repeats", () => {
    expect(appendOrdinals(["Bandit", "Hero", "Bandit", "Bandit"])).toEqual([
      "Bandit",
      "Hero",
      "Bandit 2",
      "Bandit 3",
    ])
  })

  it("counts each base name independently and returns [] for empty input", () => {
    expect(appendOrdinals([])).toEqual([])
    expect(appendOrdinals(["A", "B", "A", "B"])).toEqual([
      "A",
      "B",
      "A 2",
      "B 2",
    ])
  })
})

describe("participantDisplayNames (NAME-3 — keyed, session-order numbering)", () => {
  it("numbers duplicate enemies independently of an interleaved PC", () => {
    const { view } = makeScene([
      { id: "e1", resolved: named("Bandit") },
      { id: "hero", resolved: named("Hero") },
      { id: "e2", resolved: named("Bandit") },
      { id: "e3", resolved: named("Bandit") },
    ])
    expect(participantDisplayNames(view)).toEqual(
      new Map([
        ["e1", "Bandit"],
        ["hero", "Hero"],
        ["e2", "Bandit 2"],
        ["e3", "Bandit 3"],
      ])
    )
  })
})
