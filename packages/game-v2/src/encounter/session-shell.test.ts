import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import type { StoredSession } from "./locator"
import { defaultOverlay } from "./overlay"
import { loadSessionShell, serializeSessionShell } from "./session-shell"

/** A fresh players-side overlay blob, as the session blob would persist it. */
const overlay = defaultOverlay({ side: "players" })

/** A session with one durable PC reference + one inline (ad-hoc) enemy. */
const storedSession: StoredSession = {
  round: 2,
  currentActorId: asParticipantId("c-pc"),
  advantage: "players",
  firstSide: "enemies",
  participants: [
    {
      id: asParticipantId("c-pc"),
      locator: { storage: "durable", entityId: "pc-1" },
      overlay,
    },
    {
      id: asParticipantId("c-goblin"),
      locator: {
        storage: "inline",
        entity: {
          id: "goblin-1",
          components: { vitals: { base: 16, damage: 3 } },
        },
      },
      overlay: defaultOverlay({ side: "enemies" }),
    },
  ],
}

describe("loadSessionShell — refines the blob without dissolving homes", () => {
  it("keeps a durable participant as a reference, no hydration", () => {
    const shell = loadSessionShell(storedSession)

    expect(shell.ok).toBe(true)
    if (!shell.ok) return
    expect(shell.value.participants[0]!.entity).toEqual({
      storage: "durable",
      entityId: "pc-1",
    })
  })

  it("parses an inline entity through the F6 seam and carries scalars verbatim", () => {
    const shell = loadSessionShell(storedSession)

    expect(shell.ok).toBe(true)
    if (!shell.ok) return
    const goblin = shell.value.participants[1]!
    expect(goblin.entity).toEqual({
      storage: "inline",
      entity: {
        id: "goblin-1",
        components: { vitals: { base: 16, damage: 3 } },
      },
    })
    expect(shell.value.round).toBe(2)
    expect(shell.value.currentActorId).toBe("c-pc")
    expect(shell.value.advantage).toBe("players")
    expect(shell.value.firstSide).toBe("enemies")
    expect(shell.value).not.toHaveProperty("mapInstanceId")
  })

  it("carries mapInstanceId when present", () => {
    const shell = loadSessionShell({
      ...storedSession,
      mapInstanceId: "mi-1",
    })

    expect(shell.ok).toBe(true)
    if (!shell.ok) return
    expect(shell.value.mapInstanceId).toBe("mi-1")
  })

  it("refuses an invalid inline entity with that participant's issue", () => {
    const shell = loadSessionShell({
      ...storedSession,
      participants: [
        {
          id: asParticipantId("c-broken"),
          locator: {
            storage: "inline",
            entity: {
              id: "broken-1",
              components: { vitals: { base: "not-a-number" } },
            },
          },
          overlay,
        },
      ],
    })

    expect(shell.ok).toBe(false)
    if (shell.ok) return
    expect(shell.error).toHaveLength(1)
    expect(shell.error[0]).toMatchObject({
      participantId: "c-broken",
      kind: "invalid-entity",
    })
  })

  it("refuses an invalid overlay, aggregating every participant's issue", () => {
    const shell = loadSessionShell({
      ...storedSession,
      participants: [
        {
          id: asParticipantId("c-bad-overlay"),
          locator: { storage: "durable", entityId: "pc-1" },
          overlay: { allegiance: { side: "chaos" } },
        },
        {
          id: asParticipantId("c-broken"),
          locator: {
            storage: "inline",
            entity: { id: "broken-1", components: 7 },
          },
          overlay,
        },
      ],
    })

    expect(shell.ok).toBe(false)
    if (shell.ok) return
    expect(shell.error.map((issue) => issue.kind)).toEqual([
      "invalid-overlay",
      "invalid-entity",
    ])
  })
})

describe("serializeSessionShell — the total write-back inverse", () => {
  it("round-trips the example blob exactly", () => {
    const shell = loadSessionShell(storedSession)

    expect(shell.ok).toBe(true)
    if (!shell.ok) return
    expect(serializeSessionShell(shell.value)).toStrictEqual(storedSession)
  })
})
