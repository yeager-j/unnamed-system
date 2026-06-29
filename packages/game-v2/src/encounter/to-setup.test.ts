import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"

import { asParticipantId } from "./ids"
import { makeParticipant } from "./session"
import { toParticipantSetup } from "./to-setup"

const entity: Entity = {
  id: "e1",
  components: { identity: { name: "Iris Vey" } },
}

describe("toParticipantSetup — the R1.5 inverse (home-blind projection)", () => {
  it("projects id, side, hasActed, and a home-blind { entity } source", () => {
    const participant = makeParticipant(entity, asParticipantId("c-1"), {
      side: "players",
    })
    expect(toParticipantSetup(participant)).toEqual({
      id: "c-1",
      side: "players",
      hasActed: false,
      source: { entity },
    })
  })

  it("inverts the mint's turnsTakenThisRound back to hasActed", () => {
    const joiner = makeParticipant(entity, asParticipantId("c-2"), {
      side: "enemies",
      hasActed: true,
    })
    expect(toParticipantSetup(joiner)).toMatchObject({
      side: "enemies",
      hasActed: true,
    })
  })

  it("hands back the dissolved entity uniformly — no storage discriminant leaks", () => {
    const participant = makeParticipant(entity, asParticipantId("c-3"), {
      side: "players",
    })
    const setup = toParticipantSetup(participant)
    // The source is always { entity }; the durable/inline home rides the locator map.
    expect(setup.source).toEqual({ entity })
    expect(setup.source).not.toHaveProperty("catalog")
    expect(setup.source).not.toHaveProperty("storage")
  })
})
