import { describe, expect, it, vi } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { createResolve } from "@workspace/game-v2/resolve/resolve"

import { loadSession, saveSession, type DurableSource } from "./load-session"
import type { StoredParticipant, StoredSession } from "./locator"
import { defaultOverlay } from "./overlay"

/** A resolve bound to an empty catalog — enough to derive vitals/currentHP. */
const resolve = createResolve({ getArchetype: () => undefined })

/** A fresh players-side overlay blob, as the session blob would persist it. */
const overlay = defaultOverlay({ side: "players" })

/** A durable PC row keyed by entityId — carries vitals so currentHP re-derives. */
const irisRow = {
  id: "pc-1",
  components: {
    identity: { name: "Iris Vey" },
    vitals: { base: 30, damage: 10 },
  },
}
const loadDurable: DurableSource = (entityId) =>
  entityId === "pc-1" ? irisRow : undefined

/** A session with one durable PC + one inline (ad-hoc) enemy. */
const storedSession: StoredSession = {
  round: 1,
  currentActorId: null,
  advantage: null,
  firstSide: null,
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

describe("loadSession — dissolves both storage homes into a uniform entity (CD3)", () => {
  it("durable → fetches the row + attaches its vitals so currentHP resolves", () => {
    const loaded = loadSession(loadDurable)(storedSession)

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const pc = loaded.value.session.participants[0]!
    expect(pc.entity.components.vitals).toEqual({ base: 30, damage: 10 })
    expect(pc.entity.components.identity).toEqual({ name: "Iris Vey" })
    expect(resolve(pc.entity).components.vitals).toEqual({
      maxHP: 30,
      currentHP: 20,
    })
  })

  it("inline → loads the blob's components directly (no row fetch)", () => {
    const loaded = loadSession(loadDurable)(storedSession)
    if (!loaded.ok) throw new Error("expected ok")
    const goblin = loaded.value.session.participants[1]!
    expect(goblin.entity.id).toBe("goblin-1")
    expect(goblin.entity.components.vitals).toEqual({ base: 16, damage: 3 })
  })

  it("the dissolved Participant carries NO storage discriminant (the F1 kill)", () => {
    const loaded = loadSession(loadDurable)(storedSession)
    if (!loaded.ok) throw new Error("expected ok")
    const pc = loaded.value.session.participants[0]!
    expect(Object.keys(pc).sort()).toEqual(["entity", "id", "overlay"])
    // @ts-expect-error — Participant has no `storage` field; the home is out-of-band.
    expect(pc.storage).toBeUndefined()
  })

  it("never reads the catalog — the only entity source consulted is loadDurable", () => {
    const durableSpy = vi.fn(loadDurable)
    const loaded = loadSession(durableSpy)(storedSession)
    expect(loaded.ok).toBe(true)
    // One durable participant ⇒ exactly one row fetch; the inline arm never calls it.
    expect(durableSpy).toHaveBeenCalledTimes(1)
    expect(durableSpy).toHaveBeenCalledWith("pc-1")
  })
})

describe("loadSession — the out-of-band locator map", () => {
  it("keys locators by participant/roster id, preserving each home", () => {
    const loaded = loadSession(loadDurable)(storedSession)
    if (!loaded.ok) throw new Error("expected ok")
    expect(loaded.value.locators.get(asParticipantId("c-pc"))).toEqual({
      storage: "durable",
      entityId: "pc-1",
    })
    expect(loaded.value.locators.get(asParticipantId("c-goblin"))).toEqual({
      storage: "inline",
      entity: {
        id: "goblin-1",
        components: { vitals: { base: 16, damage: 3 } },
      },
    })
  })
})

describe("loadSession — failure modes (no faked issues)", () => {
  it("errors with a missing-durable issue for a dangling reference", () => {
    const dangling: StoredSession = {
      ...storedSession,
      participants: [
        {
          id: asParticipantId("c-x"),
          locator: { storage: "durable", entityId: "ghost" },
          overlay,
        },
      ],
    }
    const loaded = loadSession(loadDurable)(dangling)
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.error).toEqual([
      { participantId: "c-x", kind: "missing-durable", entityId: "ghost" },
    ])
  })

  it("errors with an invalid-entity issue naming the bad component", () => {
    const bad: StoredSession = {
      ...storedSession,
      participants: [
        {
          id: asParticipantId("c-bad"),
          locator: {
            storage: "inline",
            entity: { id: "e", components: { identity: { name: 42 } } },
          },
          overlay,
        },
      ],
    }
    const loaded = loadSession(loadDurable)(bad)
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    const issue = loaded.error[0]!
    expect(issue.participantId).toBe("c-bad")
    expect(issue.kind).toBe("invalid-entity")
  })

  it("errors with an invalid-overlay issue for a malformed overlay blob", () => {
    const badOverlay: StoredParticipant = {
      id: asParticipantId("c-ov"),
      locator: { storage: "inline", entity: { id: "e", components: {} } },
      overlay: { allegiance: { side: "nope" } },
    }
    const loaded = loadSession(loadDurable)({
      ...storedSession,
      participants: [badOverlay],
    })
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.error[0]!.kind).toBe("invalid-overlay")
  })

  it("reports every failing participant together", () => {
    const loaded = loadSession(loadDurable)({
      ...storedSession,
      participants: [
        {
          id: asParticipantId("c-1"),
          locator: { storage: "durable", entityId: "ghost" },
          overlay,
        },
        {
          id: asParticipantId("c-2"),
          locator: { storage: "durable", entityId: "ghost2" },
          overlay,
        },
      ],
    })
    expect(loaded.ok).toBe(false)
    if (loaded.ok) return
    expect(loaded.error.map((e) => e.participantId)).toEqual(["c-1", "c-2"])
  })
})

describe("saveSession — write-back inverse (round-trip preserves the locator)", () => {
  it("round-trips a clean session: durable as a reference, inline with live state", () => {
    const loaded = loadSession(loadDurable)(storedSession)
    if (!loaded.ok) throw new Error("expected ok")
    const round = saveSession(loaded.value.session, loaded.value.locators)

    expect(round.participants[0]!.locator).toEqual({
      storage: "durable",
      entityId: "pc-1",
    })
    expect(round.participants[1]!.locator).toEqual({
      storage: "inline",
      entity: {
        id: "goblin-1",
        components: { vitals: { base: 16, damage: 3 } },
      },
    })
    expect(round.round).toBe(1)
  })

  it("NEVER embeds durable entity content in the blob — references only", () => {
    const loaded = loadSession(loadDurable)(storedSession)
    if (!loaded.ok) throw new Error("expected ok")
    const round = saveSession(loaded.value.session, loaded.value.locators)
    const durableLocator = round.participants[0]!.locator
    expect(durableLocator.storage).toBe("durable")
    expect(durableLocator).not.toHaveProperty("entity")
  })

  it("defaults a locator-map miss to inline (a reducer-minted mid-combat joiner)", () => {
    const loaded = loadSession(loadDurable)(storedSession)
    if (!loaded.ok) throw new Error("expected ok")
    const round = saveSession(loaded.value.session, new Map())
    expect(round.participants[0]!.locator).toEqual({
      storage: "inline",
      entity: { id: "pc-1", components: irisRow.components },
    })
  })

  it("persists post-reducer inline state (a damaged inline enemy)", () => {
    const loaded = loadSession(loadDurable)(storedSession)
    if (!loaded.ok) throw new Error("expected ok")
    // Simulate a reducer write: the inline enemy took more damage.
    loaded.value.session.participants[1]!.entity.components.vitals = {
      base: 16,
      damage: 12,
    }
    const round = saveSession(loaded.value.session, loaded.value.locators)
    expect(round.participants[1]!.locator).toEqual({
      storage: "inline",
      entity: {
        id: "goblin-1",
        components: { vitals: { base: 16, damage: 12 } },
      },
    })
  })
})
