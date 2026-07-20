import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import {
  counterIds,
  entity,
  participantWith,
  sessionOf,
} from "../__fixtures__/session"
import { reduceRoster } from "./roster"

const mint = counterIds()
const run = (
  session: Parameters<typeof reduceRoster>[0],
  event: Parameters<typeof reduceRoster>[1]
) => reduceRoster(session, event, mint)

describe("reduceRoster — addParticipant (R6.2)", () => {
  it("appends a joiner entering already-acted (turnsTakenThisRound = 1), queued for next round", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = run(session, {
      kind: "addParticipant",
      setup: {
        id: asParticipantId("p2"),
        side: "enemies",
        entity: entity({}, "e2"),
      },
    })
    expect(next.participants).toHaveLength(2)
    const joiner = next.participants[1]!
    expect(joiner.id).toBe("p2")
    expect(joiner.overlay.allegiance.side).toBe("enemies")
    expect(joiner.overlay.turnState.turnsTakenThisRound).toBe(1)
    // Existing participants are untouched (reference-identity preserved).
    expect(next.participants[0]).toBe(session.participants[0])
  })

  it("mints an id via newId when setup.id is omitted", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    const next = run(session, {
      kind: "addParticipant",
      setup: { side: "players", entity: entity() },
    })
    expect(next.participants[1]!.id).toMatch(/^minted-/)
  })
})

describe("reduceRoster — removeParticipant (R6.3)", () => {
  it("drops the participant and nulls currentActorId when it was the current actor", () => {
    const session = sessionOf(
      [participantWith({ id: "p1" }), participantWith({ id: "p2" })],
      { currentActorId: "p1" }
    )
    const next = run(session, {
      kind: "removeParticipant",
      participantId: asParticipantId("p1"),
    })
    expect(next.participants.map((p) => p.id)).toEqual(["p2"])
    expect(next.currentActorId).toBeNull()
  })

  it("keeps currentActorId when a non-actor is removed, and never mutates a survivor (no engagement sever — R6.3)", () => {
    const session = sessionOf(
      [participantWith({ id: "p1" }), participantWith({ id: "p2" })],
      { currentActorId: "p1" }
    )
    const next = run(session, {
      kind: "removeParticipant",
      participantId: asParticipantId("p2"),
    })
    expect(next.currentActorId).toBe("p1")
    // The survivor is reference-identical — nothing reached into it to sever an
    // engagement (that is the Tier-3 occupancy-prune obligation, not the reducer's).
    expect(next.participants[0]).toBe(session.participants[0])
  })

  it("is a no-op (same-ref) for an unknown id", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(
      run(session, {
        kind: "removeParticipant",
        participantId: asParticipantId("ghost"),
      })
    ).toBe(session)
  })
})
