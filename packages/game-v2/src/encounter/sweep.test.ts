import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { defaultOverlay, type OverlayComponents } from "./overlay"
import { makeParticipant, type Session } from "./session"
import { sweepOverlay } from "./sweep"

/** An overlay with every one of the six components carrying combat state. */
const dirtyOverlay: OverlayComponents = {
  allegiance: { side: "enemies" },
  turnState: {
    movesUsed: 1,
    standardsUsed: 1,
    reactionsUsed: 1,
    turnsTakenThisRound: 2,
  },
  ailments: ["burn", "downed"],
  battleConditions: {
    attack: "increased",
    defense: "decreased",
    hitEvasion: "increased",
    charged: true,
    concentrating: true,
  },
  conditionDurations: { attack: 2 },
  counters: { lumina: 3 },
}

function sessionWith(...overlays: OverlayComponents[]): Session {
  return {
    round: 3,
    currentActorId: null,
    advantage: "players",
    firstSide: "players",
    participants: overlays.map((overlay, index) => ({
      id: asParticipantId(`c-${index}`),
      entity: { id: `e-${index}`, components: {} },
      overlay,
    })),
  }
}

describe("sweepOverlay — the end-of-combat overlay sweep (CD1/CD16)", () => {
  it("clears every overlay component back to the fresh R1.1 default (totality)", () => {
    const swept = sweepOverlay(sessionWith(dirtyOverlay))
    expect(swept.participants[0]!.overlay).toEqual(
      defaultOverlay({ side: "enemies" })
    )
  })

  it("preserves each participant's side (allegiance is roster composition)", () => {
    const swept = sweepOverlay(
      sessionWith(dirtyOverlay, defaultOverlay({ side: "players" }))
    )
    expect(swept.participants[0]!.overlay.allegiance.side).toBe("enemies")
    expect(swept.participants[1]!.overlay.allegiance.side).toBe("players")
  })

  it("leaves durable entity components untouched (sweep is overlay-only)", () => {
    const participant = makeParticipant(
      { id: "pc-1", components: { vitals: { base: 30, damage: 10 } } },
      asParticipantId("c-pc"),
      { side: "players" }
    )
    participant.overlay.ailments = ["shock"]
    const session: Session = { ...sessionWith(), participants: [participant] }
    const swept = sweepOverlay(session)
    expect(swept.participants[0]!.entity.components.vitals).toEqual({
      base: 30,
      damage: 10,
    })
    expect(swept.participants[0]!.overlay.ailments).toEqual([])
  })

  it("preserves the session scalars verbatim", () => {
    const swept = sweepOverlay(sessionWith(dirtyOverlay))
    expect(swept.round).toBe(3)
    expect(swept.advantage).toBe("players")
    expect(swept.firstSide).toBe("players")
  })

  it("returns the same session reference when every overlay is already fresh", () => {
    const session = sessionWith(
      defaultOverlay({ side: "players" }),
      defaultOverlay({ side: "enemies" })
    )
    expect(sweepOverlay(session)).toBe(session)
  })

  it("keeps an already-fresh participant's reference in a mixed session", () => {
    const session = sessionWith(
      defaultOverlay({ side: "players" }),
      dirtyOverlay
    )
    const swept = sweepOverlay(session)
    expect(swept).not.toBe(session)
    expect(swept.participants[0]).toBe(session.participants[0])
    expect(swept.participants[1]).not.toBe(session.participants[1])
  })
})
