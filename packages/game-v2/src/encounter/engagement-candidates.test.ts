import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  free,
  makeMapInstanceState,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { participantWith, sessionOf } from "./__fixtures__/session"
import { engagementCandidates } from "./engagement-candidates"

const pid = asParticipantId

const session = sessionOf([
  participantWith({ id: "hero", side: "players" }),
  participantWith({ id: "ally", side: "players" }),
  participantWith({ id: "goblin", side: "enemies" }),
  participantWith({ id: "ogre", side: "enemies" }),
])

describe("engagementCandidates (D28#2 allegiance-gated, composition-tier)", () => {
  it("returns opposing-side combatants in the same zone", () => {
    const mapInstance = makeMapInstanceState({
      occupancy: {
        hero: free("z1"),
        ally: free("z1"),
        goblin: free("z1"),
        ogre: free("z2"),
      },
    })
    expect(engagementCandidates(session, mapInstance, pid("hero"))).toEqual([
      pid("goblin"),
    ])
  })

  it("excludes same-side combatants even when co-located", () => {
    const mapInstance = makeMapInstanceState({
      occupancy: { hero: free("z1"), ally: free("z1") },
    })
    expect(engagementCandidates(session, mapInstance, pid("hero"))).toEqual([])
  })

  it("returns [] for an unplaced actor (nowhere to engage from)", () => {
    const mapInstance = makeMapInstanceState({
      occupancy: { goblin: free("z1") },
    })
    expect(engagementCandidates(session, mapInstance, pid("hero"))).toEqual([])
  })

  it("returns [] for an unknown actor", () => {
    expect(
      engagementCandidates(session, makeMapInstanceState(), pid("nobody"))
    ).toEqual([])
  })
})
