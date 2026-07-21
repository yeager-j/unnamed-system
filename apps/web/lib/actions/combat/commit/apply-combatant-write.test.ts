import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeParticipant,
  type Session,
  type StoredEntityLocator,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { err, ok } from "@workspace/result"

import type { LoadedEncounterForWrite } from "@/lib/db/queries/load-encounter-session"
import type { EncounterRow } from "@/lib/db/schema/encounter"

import { applyCombatantWriteAction } from "./apply-combatant-write"

// The router's seams: the v2 write-path loader, the session auth gate + guarded
// blob write (session arm), and the shared executor-neutral durable Store (durable
// arm — it owns its own load + auth + guard + stamp, tested in the Store's own
// suite). Stub them; the descriptor schema, the Writers, the reducer, and the
// fail-closed saver run for real — the contract under test is the *routing*, not
// the durable commit's arithmetic.
const requireCampaignDM = vi.fn()
const requireActor = vi.fn()
const loadEncounterForWrite = vi.fn()
const saveEncounterSession = vi.fn()
const commitEntityWrite = vi.fn()
const publishEncounterPing = vi.fn()
const publishCharacterPing = vi.fn()
const revalidateEncounter = vi.fn()
const finalizeExternalActionCommit = vi.fn(async (..._args: unknown[]) => {})
const forbidden = vi.fn(() => {
  throw new Error("forbidden")
})

vi.mock("next/navigation", () => ({ forbidden: () => forbidden() }))
vi.mock("@/lib/auth/actor", () => ({ requireActor: () => requireActor() }))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForWrite: (id: string) => loadEncounterForWrite(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  saveEncounterSession: (
    id: string,
    stored: StoredSession,
    v: number,
    tx: unknown
  ) => saveEncounterSession(id, stored, v, tx),
}))
vi.mock("@/lib/actions/entity/entity-row-store", () => ({
  commitEntityWrite: (
    executor: unknown,
    actor: unknown,
    args: unknown,
    stamp: unknown
  ) => commitEntityWrite(executor, actor, args, stamp),
}))
vi.mock("../../entity/authorize-write", () => ({
  isEntityWriteAuthRejection: (rejection: string) =>
    rejection === "unauthorized" ||
    rejection === "archetype-hidden" ||
    rejection === "archetype-locked",
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
  publishCharacterPing: (shortId: string, kind: string, versions: unknown) =>
    publishCharacterPing(shortId, kind, versions),
}))
vi.mock("../../encounter/revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))
// The durable arm's external-commit finalization (UNN-676) — the package half
// is contract-tested in @workspace/headcanon; the app publisher chain pulls
// `server-only`, so both are stubbed at this unit's seam.
vi.mock("@workspace/headcanon/next/server", () => ({
  finalizeExternalActionCommit: (
    stamp: unknown,
    publisher: unknown,
    report: unknown
  ) => finalizeExternalActionCommit(stamp, publisher, report),
}))
vi.mock("../../entity/mutations/invalidations", () => ({
  entityInvalidationPublisher: { publish: vi.fn() },
  reportInvalidationFailure: vi.fn(),
}))

const ENCOUNTER_ID = "encounter-1"
const PC_ID = asParticipantId("c-pc")
const GOBLIN_ID = asParticipantId("c-goblin")
const ACTOR = { userId: "u1", email: "u1@example.com" }

function makeSession(): Session {
  return {
    round: 2,
    currentActorId: null,
    advantage: "players",
    firstSide: "players",
    participants: [
      makeParticipant(
        {
          id: "char-1",
          components: {
            vitals: { base: 30, damage: 10 },
            skillPool: { base: 12, spSpent: 2 },
          },
        },
        PC_ID,
        { side: "players" }
      ),
      makeParticipant(
        {
          id: "goblin-1",
          components: {
            vitals: { base: 16, damage: 3 },
            mechanics: {
              states: { perfection: { kind: "perfection", rank: 1 } },
            },
          },
        },
        GOBLIN_ID,
        { side: "enemies" }
      ),
    ],
  }
}

function makeLoaded(): LoadedEncounterForWrite {
  const locators = new Map<ParticipantId, StoredEntityLocator>([
    [PC_ID, { storage: "durable", entityId: "char-1" }],
    [
      GOBLIN_ID,
      {
        storage: "inline",
        entity: {
          id: "goblin-1",
          components: { vitals: { base: 16, damage: 3 } },
        },
      },
    ],
  ])
  return {
    row: {
      id: ENCOUNTER_ID,
      campaignId: "campaign-1",
      shortId: "enc1",
      name: "Test",
      status: "live",
      mapInstanceId: "mi-1",
      session: { round: 2 },
      version: 4,
    } as EncounterRow,
    loaded: { session: makeSession(), locators },
    durableVersions: new Map([["char-1", 7]]),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue({ id: "campaign-1" })
  requireActor.mockResolvedValue(ACTOR)
  loadEncounterForWrite.mockResolvedValue(ok(makeLoaded()))
  saveEncounterSession.mockResolvedValue(ok({ version: 5 }))
  commitEntityWrite.mockResolvedValue(
    ok({
      version: 8,
      shortId: "chr1",
      versionClass: "vitals",
      status: "finalized",
    })
  )
})

const BASE = { encounterId: ENCOUNTER_ID }
/** The session arm's honest envelope — the encounter token only (UNN-567). */
const INLINE = { ...BASE, expectedVersion: 4 }
/** The durable arm's envelope — the entity token is still required on the wire so
 *  a mis-routed session write fails closed, though its value is no longer read
 *  (server-authoritative guard, UNN-674). */
const DURABLE = { ...BASE, expectedCharacterVersion: 7 }

describe("applyCombatantWriteAction — the locator-derived home (CD19)", () => {
  it("routes an inline participant through the session arm (reducer + blob)", async () => {
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: GOBLIN_ID,
      write: { component: "vitals", op: "damage", amount: 7 },
    })

    expect(result).toEqual(
      ok({ version: 5, channel: { domain: "encounter", shortId: "enc1" } })
    )
    expect(requireCampaignDM).toHaveBeenCalledWith("campaign-1")
    const blob = saveEncounterSession.mock.calls[0]![1] as StoredSession
    const goblin = blob.participants.find((p) => p.id === GOBLIN_ID)!
    expect(goblin.locator).toEqual({
      storage: "inline",
      entity: {
        id: "goblin-1",
        components: {
          vitals: { base: 16, damage: 10 },
          mechanics: {
            states: { perfection: { kind: "perfection", rank: 1 } },
          },
        },
      },
    })
    // The durable Store never runs for an inline participant.
    expect(commitEntityWrite).not.toHaveBeenCalled()
    expect(publishEncounterPing).toHaveBeenCalledWith("enc1", {
      version: 5,
      status: "live",
    })
  })

  it("routes a durable participant through the shared entity Store", async () => {
    const result = await applyCombatantWriteAction({
      ...DURABLE,
      participantId: PC_ID,
      write: { component: "vitals", op: "damage", amount: 5 },
    })

    expect(result).toEqual(
      ok({ version: 8, channel: { domain: "character", shortId: "chr1" } })
    )
    // Forwarded to the executor-neutral Store, keyed by the locator's entity id,
    // as the authenticated actor and standalone `db` executor; the Store owns
    // load + auth + the server-authoritative guarded commit + the axis stamp.
    expect(commitEntityWrite).toHaveBeenCalledWith(
      expect.anything(),
      ACTOR,
      {
        entityId: "char-1",
        write: { component: "vitals", op: "damage", amount: 5 },
      },
      expect.anything()
    )
    // A durable write NEVER reaches the session blob — the routing invariant.
    expect(saveEncounterSession).not.toHaveBeenCalled()
    // The ping (relocated out of the version guard) invalidates every other
    // watcher of the character channel...
    expect(publishCharacterPing).toHaveBeenCalledWith("chr1", "entity", {
      vitals: 8,
    })
    // ...and it DOES revalidate this encounter's route (UNN-567): the RSC payload
    // rides the transition response, so the console's optimistic frame doesn't
    // flash back to the stale base while waiting for the pc-ping refresh.
    expect(revalidateEncounter).toHaveBeenCalledWith(
      expect.objectContaining({ shortId: "enc1" })
    )
  })

  it("the server's locator map is authoritative — the wire carries no home to lie about", async () => {
    // A client believing the PC is inline sends the inline envelope (the
    // encounter token, no character token). The locator says durable, so the
    // write fails closed on the durable arm's own requirement rather than
    // falling through to the blob — a wrong belief cannot mis-route.
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: PC_ID,
      write: { component: "vitals", op: "damage", amount: 5 },
    })
    expect(result).toEqual(err("missing-character-version"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
    expect(commitEntityWrite).not.toHaveBeenCalled()
  })

  it("the session arm requires its own token — an inline write without the encounter version fails closed (UNN-567)", async () => {
    // The mirror case: a client believing the goblin durable sends only a
    // character token. The locator says inline; the session arm refuses
    // symmetric with the durable arm rather than guessing a guard.
    const result = await applyCombatantWriteAction({
      ...DURABLE,
      participantId: GOBLIN_ID,
      write: { component: "vitals", op: "damage", amount: 5 },
    })
    expect(result).toEqual(err("missing-encounter-version"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
    expect(commitEntityWrite).not.toHaveBeenCalled()
  })

  it("rejects an unknown participant", async () => {
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: asParticipantId("ghost"),
      write: { component: "vitals", op: "damage", amount: 1 },
    })
    expect(result).toEqual(err("participant-not-found"))
  })
})

describe("applyCombatantWriteAction — auth (one gate per home)", () => {
  it("session arm: a non-DM is rejected by requireCampaignDM before any write", async () => {
    requireCampaignDM.mockRejectedValue(new Error("forbidden"))
    await expect(
      applyCombatantWriteAction({
        ...INLINE,
        participantId: GOBLIN_ID,
        write: { component: "vitals", op: "damage", amount: 1 },
      })
    ).rejects.toThrow("forbidden")
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("durable arm: the Store's typed authorization refusal becomes a forbidden()", async () => {
    // The durable gate lives inside the Store (one gate for the sheet buttons and
    // the console); it returns a typed refusal, which the arm translates to a 403
    // to preserve combat's forbidden() posture (UNN-674).
    commitEntityWrite.mockResolvedValue(err("unauthorized"))
    await expect(
      applyCombatantWriteAction({
        ...DURABLE,
        participantId: PC_ID,
        write: { component: "vitals", op: "heal", amount: 2 },
      })
    ).rejects.toThrow("forbidden")
    expect(forbidden).toHaveBeenCalledOnce()
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })
})

describe("applyCombatantWriteAction — Writer refusals (session arm)", () => {
  it("refuses an SP write against a no-skillPool participant (capability no-op → real error)", async () => {
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: GOBLIN_ID,
      write: { component: "skillPool", op: "damage", amount: 2 },
    })
    expect(result).toEqual(err("capability-missing"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("seeds an absent-but-owned mechanic state from its initial state (the S2a read-path mirror)", async () => {
    // The goblin owns a `mechanics` component (perfection) but has no stored
    // valor state — since UNN-557 the Writer transitions from the mechanic's
    // initial state, mirroring what `getActiveMechanics` renders. (A truly
    // mechanics-less participant still refuses; the skillPool test below pins
    // the capability-missing arm.)
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: GOBLIN_ID,
      write: {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 1 },
      },
    })
    expect(result.ok).toBe(true)
    const blob = saveEncounterSession.mock.calls[0]![1] as StoredSession
    const goblin = blob.participants.find((p) => p.id === GOBLIN_ID)!
    const entity = (
      goblin.locator as { entity: { components: { mechanics: unknown } } }
    ).entity
    expect(entity.components.mechanics).toEqual({
      states: {
        perfection: { kind: "perfection", rank: 1 },
        valor: { kind: "valor", value: 1 },
      },
    })
  })

  it("refuses a session-arm usePrisma before any reduce (deps-driven)", async () => {
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: GOBLIN_ID,
      write: { component: "resources", op: "usePrisma" },
    })
    // capability first: the goblin has no Resources component at all.
    expect(result).toEqual(err("capability-missing"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("applies a carried mechanic transition into the blob", async () => {
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: GOBLIN_ID,
      write: {
        component: "mechanics",
        mechanic: "perfection",
        transition: { op: "adjust", delta: 2 },
      },
    })
    expect(result.ok).toBe(true)
    const blob = saveEncounterSession.mock.calls[0]![1] as StoredSession
    const goblin = blob.participants.find((p) => p.id === GOBLIN_ID)!
    const entity = (
      goblin.locator as { entity: { components: { mechanics: unknown } } }
    ).entity
    expect(entity.components.mechanics).toEqual({
      states: { perfection: { kind: "perfection", rank: 3 } },
    })
  })
})

describe("applyCombatantWriteAction — durable arm forwards to the entity Store", () => {
  it("forwards every component family verbatim (no per-field fan-out)", async () => {
    for (const write of [
      { component: "skillPool", op: "heal", amount: 3 },
      { component: "resources", op: "usePrisma" },
      {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 1 },
      },
    ] as const) {
      commitEntityWrite.mockClear()
      await applyCombatantWriteAction({
        ...DURABLE,
        participantId: PC_ID,
        write,
      })
      expect(commitEntityWrite).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        { entityId: "char-1", write },
        expect.anything()
      )
    }
  })

  it("maps a lost race (contention) to `stale` and revalidates nothing", async () => {
    commitEntityWrite.mockRejectedValue(new MutationContentionError())
    const result = await applyCombatantWriteAction({
      ...DURABLE,
      participantId: PC_ID,
      write: { component: "vitals", op: "damage", amount: 1 },
    })
    expect(result).toEqual(err("stale"))
    expect(revalidateEncounter).not.toHaveBeenCalled()
    expect(publishCharacterPing).not.toHaveBeenCalled()
  })

  it("routes setMax to the store now that a durable max is a real write (v2)", async () => {
    // Native depletion: `setMax` no longer refuses on a durable row — it forwards
    // like any other write (the store owns the semantics, tested in its suite).
    await applyCombatantWriteAction({
      ...DURABLE,
      participantId: PC_ID,
      write: { component: "vitals", op: "setMax", amount: 40 },
    })
    expect(commitEntityWrite).toHaveBeenCalledWith(
      expect.anything(),
      ACTOR,
      {
        entityId: "char-1",
        write: { component: "vitals", op: "setMax", amount: 40 },
      },
      expect.anything()
    )
  })
})

describe("applyCombatantWriteAction — parse boundary", () => {
  it("rejects a malformed descriptor (foreign mechanic transition) as invalid-input", async () => {
    const result = await applyCombatantWriteAction({
      ...INLINE,
      participantId: GOBLIN_ID,
      // Well-typed (transition is `unknown` on the wire) but fails the
      // per-mechanic registry validation inside the schema.
      write: {
        component: "mechanics",
        mechanic: "perfection",
        transition: { op: "setMode", value: true },
      },
    })
    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterForWrite).not.toHaveBeenCalled()
  })
})
