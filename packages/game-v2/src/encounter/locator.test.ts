import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { loadSession, saveSession, type DurableSource } from "./load-session"
import { storedSessionSchema, type StoredSession } from "./locator"
import { defaultOverlay } from "./overlay"

/** A blob as the jsonb column would hold it — both locator arms present. */
const blob: StoredSession = {
  round: 2,
  currentActorId: asParticipantId("c-pc"),
  advantage: "players",
  firstSide: "enemies",
  participants: [
    {
      id: asParticipantId("c-pc"),
      locator: { storage: "durable", entityId: "pc-1" },
      overlay: defaultOverlay({ side: "players" }),
    },
    {
      id: asParticipantId("c-goblin"),
      locator: {
        storage: "inline",
        entity: { id: "goblin-1", components: { vitals: { base: 16 } } },
      },
      overlay: defaultOverlay({ side: "enemies" }),
    },
  ],
}

describe("storedSessionSchema — the persisted-contract boundary parse (F6)", () => {
  it("parses a well-formed blob, preserving both locator arms", () => {
    const parsed = storedSessionSchema.safeParse(blob)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data).toEqual(blob)
  })

  it("round-trips the saver's output (schema and saveSession agree)", () => {
    const loadDurable: DurableSource = (entityId) =>
      entityId === "pc-1"
        ? { id: "pc-1", components: { vitals: { base: 30 } } }
        : undefined
    const loaded = loadSession(loadDurable)(blob)
    if (!loaded.ok) throw new Error("expected ok")
    const saved = saveSession(loaded.value.session, loaded.value.locators)
    if (!saved.ok) throw new Error("expected ok")

    const parsed = storedSessionSchema.safeParse(saved.value)
    expect(parsed.success).toBe(true)
  })

  it("keeps components + overlay opaque (validated downstream at the F6 seams)", () => {
    const withOpaque = {
      ...blob,
      participants: [
        {
          id: "c-x",
          locator: {
            storage: "inline",
            entity: { id: "e", components: { anything: "goes" } },
          },
          overlay: { not: "an overlay shape" },
        },
      ],
    }
    expect(storedSessionSchema.safeParse(withOpaque).success).toBe(true)
  })

  it("rejects an envelope violation (a locator naming neither arm)", () => {
    const bad = {
      ...blob,
      participants: [
        { id: "c-x", locator: { storage: "catalog", key: "goblin" } },
      ],
    }
    expect(storedSessionSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects malformed scalars (a non-positive round)", () => {
    expect(storedSessionSchema.safeParse({ ...blob, round: 0 }).success).toBe(
      false
    )
  })
})
