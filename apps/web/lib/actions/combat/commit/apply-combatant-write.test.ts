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
import { err, ok } from "@workspace/game/foundation"

import type {
  EncounterRowV2,
  LoadedEncounterForWrite,
} from "@/lib/db/queries/load-encounter-v2"

import { applyCombatantWriteAction } from "./apply-combatant-write"

// The router's seams: the v2 write-path loader, the two auth gates (one per
// home), the guarded blob write (session arm), and the per-field character
// wrappers (durable arm). Stub them all; the descriptor schema, the Writers,
// the reducer, and the fail-closed saver run for real — the contract under
// test is the routing, not the arithmetic.
const requireCampaignDM = vi.fn()
const requireOwnerOrCampaignDM = vi.fn()
const loadEncounterForWrite = vi.fn()
const saveStoredEncounterSession = vi.fn()
const applyDamageForCharacter = vi.fn()
const applyHealForCharacter = vi.fn()
const applySpendSPForCharacter = vi.fn()
const applyRecoverSPForCharacter = vi.fn()
const applyUsePrismaForCharacter = vi.fn()
const applyMechanicStateForCharacter = vi.fn()
const publishEncounterPing = vi.fn()
const revalidateEncounter = vi.fn()
const revalidateCharacter = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
  requireOwnerOrCampaignDM: (id: string) => requireOwnerOrCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter-v2", () => ({
  loadEncounterForWrite: (id: string) => loadEncounterForWrite(id),
}))
vi.mock("@/lib/db/writes/encounter-v2", () => ({
  saveStoredEncounterSession: (
    id: string,
    stored: StoredSession,
    v: number,
    tx: unknown
  ) => saveStoredEncounterSession(id, stored, v, tx),
}))
vi.mock("@/lib/db/writes/adjust-pools", () => ({
  applyDamageForCharacter: (id: string, amount: number, v: number) =>
    applyDamageForCharacter(id, amount, v),
  applyHealForCharacter: (id: string, amount: number, v: number) =>
    applyHealForCharacter(id, amount, v),
  applySpendSPForCharacter: (id: string, amount: number, v: number) =>
    applySpendSPForCharacter(id, amount, v),
  applyRecoverSPForCharacter: (id: string, amount: number, v: number) =>
    applyRecoverSPForCharacter(id, amount, v),
  applyUsePrismaForCharacter: (id: string, v: number) =>
    applyUsePrismaForCharacter(id, v),
}))
vi.mock("@/lib/db/writes/mechanic-state", () => ({
  applyMechanicStateForCharacter: (
    id: string,
    kind: string,
    transition: (state: unknown) => unknown,
    v: number
  ) => applyMechanicStateForCharacter(id, kind, transition, v),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
}))
vi.mock("../../encounter/revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))
vi.mock("../../revalidate", () => ({
  revalidateCharacter: (character: { shortId: string }) =>
    revalidateCharacter(character),
}))

const ENCOUNTER_ID = "encounter-1"
const PC_ID = asParticipantId("c-pc")
const GOBLIN_ID = asParticipantId("c-goblin")

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
    } as EncounterRowV2,
    loaded: { session: makeSession(), locators },
    durableVersions: new Map([["char-1", 7]]),
  }
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: "campaign-1" })
  requireOwnerOrCampaignDM.mockReset().mockResolvedValue({
    id: "char-1",
    shortId: "chr1",
    status: "finalized",
  })
  loadEncounterForWrite.mockReset().mockResolvedValue(ok(makeLoaded()))
  saveStoredEncounterSession.mockReset().mockResolvedValue(ok({ version: 5 }))
  applyDamageForCharacter
    .mockReset()
    .mockResolvedValue(ok({ currentHP: 15, version: 8 }))
  applyHealForCharacter
    .mockReset()
    .mockResolvedValue(ok({ currentHP: 25, version: 8 }))
  applySpendSPForCharacter
    .mockReset()
    .mockResolvedValue(ok({ currentSP: 8, version: 8 }))
  applyRecoverSPForCharacter
    .mockReset()
    .mockResolvedValue(ok({ currentSP: 12, version: 8 }))
  applyUsePrismaForCharacter
    .mockReset()
    .mockResolvedValue(ok({ prismaCharges: 1, version: 8 }))
  applyMechanicStateForCharacter
    .mockReset()
    .mockResolvedValue(ok({ value: { kind: "valor", value: 3 }, version: 8 }))
  publishEncounterPing.mockReset()
  revalidateEncounter.mockReset()
  revalidateCharacter.mockReset()
})

const BASE = { encounterId: ENCOUNTER_ID, expectedVersion: 4 }

describe("applyCombatantWriteAction — the locator-derived home (CD19)", () => {
  it("routes an inline participant through the session arm (reducer + blob)", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: GOBLIN_ID,
      write: { component: "vitals", op: "damage", amount: 7 },
    })

    expect(result).toEqual(
      ok({ version: 5, channel: { domain: "encounter", shortId: "enc1" } })
    )
    expect(requireCampaignDM).toHaveBeenCalledWith("campaign-1")
    const blob = saveStoredEncounterSession.mock.calls[0]![1] as StoredSession
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
    // The durable wrappers never run for an inline participant.
    expect(applyDamageForCharacter).not.toHaveBeenCalled()
    expect(publishEncounterPing).toHaveBeenCalledWith("enc1", {
      version: 5,
      status: "live",
    })
  })

  it("routes a durable participant through the entity-row arm (per-field wrapper)", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      expectedCharacterVersion: 7,
      write: { component: "vitals", op: "damage", amount: 5 },
    })

    expect(result).toEqual(
      ok({ version: 8, channel: { domain: "character", shortId: "chr1" } })
    )
    expect(requireOwnerOrCampaignDM).toHaveBeenCalledWith("char-1")
    expect(applyDamageForCharacter).toHaveBeenCalledWith("char-1", 5, 7)
    // A durable write NEVER reaches the session blob — the routing invariant.
    expect(saveStoredEncounterSession).not.toHaveBeenCalled()
    expect(revalidateCharacter).toHaveBeenCalled()
  })

  it("the server's locator map is authoritative — the wire carries no home to lie about", async () => {
    // A client hoping to route the PC through the session arm has no field to
    // say so: the same input as the durable test, minus the character token,
    // is refused rather than falling through to the blob.
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      write: { component: "vitals", op: "damage", amount: 5 },
    })
    expect(result).toEqual(err("missing-character-version"))
    expect(saveStoredEncounterSession).not.toHaveBeenCalled()
    expect(applyDamageForCharacter).not.toHaveBeenCalled()
  })

  it("rejects an unknown participant", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
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
        ...BASE,
        participantId: GOBLIN_ID,
        write: { component: "vitals", op: "damage", amount: 1 },
      })
    ).rejects.toThrow("forbidden")
    expect(saveStoredEncounterSession).not.toHaveBeenCalled()
  })

  it("durable arm: a viewer who is neither owner nor this character's campaign DM is rejected", async () => {
    requireOwnerOrCampaignDM.mockRejectedValue(new Error("forbidden"))
    await expect(
      applyCombatantWriteAction({
        ...BASE,
        participantId: PC_ID,
        expectedCharacterVersion: 7,
        write: { component: "vitals", op: "heal", amount: 2 },
      })
    ).rejects.toThrow("forbidden")
    expect(applyHealForCharacter).not.toHaveBeenCalled()
  })
})

describe("applyCombatantWriteAction — Writer refusals (session arm)", () => {
  it("refuses an SP write against a no-skillPool participant (capability no-op → real error)", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: GOBLIN_ID,
      write: { component: "skillPool", op: "damage", amount: 2 },
    })
    expect(result).toEqual(err("capability-missing"))
    expect(saveStoredEncounterSession).not.toHaveBeenCalled()
  })

  it("refuses a mechanic transition the participant doesn't carry", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: GOBLIN_ID,
      write: {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 1 },
      },
    })
    expect(result).toEqual(err("capability-missing"))
    expect(saveStoredEncounterSession).not.toHaveBeenCalled()
  })

  it("refuses a session-arm usePrisma before any reduce (deps-driven)", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: GOBLIN_ID,
      write: { component: "resources", op: "usePrisma" },
    })
    // capability first: the goblin has no Resources component at all.
    expect(result).toEqual(err("capability-missing"))
    expect(saveStoredEncounterSession).not.toHaveBeenCalled()
  })

  it("applies a carried mechanic transition into the blob", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: GOBLIN_ID,
      write: {
        component: "mechanics",
        mechanic: "perfection",
        transition: { op: "adjust", delta: 2 },
      },
    })
    expect(result.ok).toBe(true)
    const blob = saveStoredEncounterSession.mock.calls[0]![1] as StoredSession
    const goblin = blob.participants.find((p) => p.id === GOBLIN_ID)!
    const entity = (
      goblin.locator as { entity: { components: { mechanics: unknown } } }
    ).entity
    expect(entity.components.mechanics).toEqual({
      states: { perfection: { kind: "perfection", rank: 3 } },
    })
  })
})

describe("applyCombatantWriteAction — durable-arm semantics (interim rule)", () => {
  it("delegates each component to its per-field wrapper", async () => {
    await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      expectedCharacterVersion: 7,
      write: { component: "skillPool", op: "heal", amount: 3 },
    })
    expect(applyRecoverSPForCharacter).toHaveBeenCalledWith("char-1", 3, 7)

    await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      expectedCharacterVersion: 7,
      write: { component: "resources", op: "usePrisma" },
    })
    expect(applyUsePrismaForCharacter).toHaveBeenCalledWith("char-1", 7)

    await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      expectedCharacterVersion: 7,
      write: {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 1 },
      },
    })
    expect(applyMechanicStateForCharacter).toHaveBeenCalledWith(
      "char-1",
      "valor",
      expect.any(Function),
      7
    )
  })

  it("the durable mechanic delegation applies the same registry transition", async () => {
    await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      expectedCharacterVersion: 7,
      write: {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 2 },
      },
    })
    const transition = applyMechanicStateForCharacter.mock.calls[0]![2] as (
      state: unknown
    ) => unknown
    expect(transition({ kind: "valor", value: 3 })).toEqual({
      kind: "valor",
      value: 5,
    })
  })

  it("refuses setMax on a durable row (a PC's max derives from the engine)", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      expectedCharacterVersion: 7,
      write: { component: "vitals", op: "setMax", amount: 40 },
    })
    expect(result).toEqual(err("unsupported-durable-write"))
  })

  it("propagates a stale character write", async () => {
    applyDamageForCharacter.mockResolvedValue(err("stale"))
    const result = await applyCombatantWriteAction({
      ...BASE,
      participantId: PC_ID,
      expectedCharacterVersion: 6,
      write: { component: "vitals", op: "damage", amount: 1 },
    })
    expect(result).toEqual(err("stale"))
    expect(revalidateCharacter).not.toHaveBeenCalled()
  })
})

describe("applyCombatantWriteAction — parse boundary", () => {
  it("rejects a malformed descriptor (foreign mechanic transition) as invalid-input", async () => {
    const result = await applyCombatantWriteAction({
      ...BASE,
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
