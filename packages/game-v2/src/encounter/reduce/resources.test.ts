import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { participantWith, sessionOf } from "../__fixtures__/session"
import type { UseResourceEvent } from "../session-event"
import { reduceUseResource } from "./resources"

const use = (participantId = "p1"): UseResourceEvent => ({
  kind: "useResource",
  participantId: asParticipantId(participantId),
  resource: "prisma",
})

const resourceParticipant = (prismaUsed = 0) =>
  participantWith({
    id: "p1",
    components: {
      resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed },
    },
  })

describe("reduceUseResource", () => {
  it("is a no-op (same-ref) for an unknown participant id", () => {
    const session = sessionOf([resourceParticipant()])
    expect(reduceUseResource(session, use("ghost"))).toBe(session)
  })

  it("is a no-op (same-ref) when the participant has no Resources component", () => {
    const session = sessionOf([participantWith({ id: "p1" })])
    expect(reduceUseResource(session, use())).toBe(session)
  })

  it("increments prismaUsed (total; affordability lives in the Writer)", () => {
    const session = sessionOf([resourceParticipant(1)])
    const next = reduceUseResource(session, use())
    expect(next.participants[0]!.entity.components.resources).toEqual({
      hitDiceUsed: 0,
      skillDiceUsed: 0,
      prismaUsed: 2,
    })
    expect(
      session.participants[0]!.entity.components.resources!.prismaUsed
    ).toBe(1)
  })
})
