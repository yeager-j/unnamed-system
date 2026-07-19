import { beforeEach, describe, expect, it, vi } from "vitest"

import { defaultOverlay } from "@workspace/game-v2/encounter"

import { loadCombatAcceptedAction } from "./snapshot"

/**
 * The batched bootstrap door's mapping + security contract (UNN-646; storage-
 * native root UNN-655). The db chain is stubbed (the per-root single-statement
 * joins ARE the atomicity argument and can only be exercised against Postgres
 * — the real-DB door test covers that); the real parse + shell-refinement and
 * narrowing seams run, so the pins are genuine. The encounter pin: the tuple
 * contains only facts atomically stored under the encounter row — durable
 * participants appear as REFERENCES only, never hydrated components.
 */
const requireCampaignDM = vi.fn()
const loadEncounterEnvelopeById = vi.fn()
const registered = vi.fn()
let selectResults: unknown[][] = []

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (campaignId: string) => requireCampaignDM(campaignId),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterEnvelopeById: (id: string) => loadEncounterEnvelopeById(id),
}))
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: (rows: unknown) => ({
        onConflictDoUpdate: () => {
          registered(rows)
          return Promise.resolve()
        },
      }),
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(selectResults.shift() ?? []),
        }),
      }),
    }),
  },
}))

const encounterIdentity = { clientGroupId: "encounter:enc1", clientId: "t1" }
const durableIdentity = { clientGroupId: "combat-entity:e1", clientId: "t1" }

const encounterEnvelope = {
  id: "enc1",
  shortId: "es1",
  campaignId: "c1",
  status: "live",
}

/** The goblin's DM-authored inline bag — includes a non-combat component to
 *  pin that the storage-native root serves the row's facts WHOLE (the
 *  UNN-655 posture: the DM gate is the license; narrowing to the four combat
 *  keys is the durable roots' posture and the composition seam's concern). */
const goblinComponents = {
  vitals: { base: 8, damage: 1 },
  presentation: { portraitUrl: "https://blob.example/goblin.png" },
}

const storedSession = {
  round: 2,
  currentActorId: null,
  advantage: null,
  firstSide: null,
  participants: [
    {
      id: "p-goblin",
      locator: {
        storage: "inline",
        entity: { id: "goblin-1", components: goblinComponents },
      },
      overlay: defaultOverlay({ side: "enemies" }),
    },
    {
      id: "p-pc",
      locator: { storage: "durable", entityId: "e1" },
      overlay: defaultOverlay({ side: "players" }),
    },
  ],
}

const encounterRow = {
  id: "enc1",
  status: "live",
  version: 12,
  session: storedSession,
}

/** An entity join row shaped like the real `entity` table (component columns
 *  + version columns) so the real `loadEntityRow` seam runs. */
function entityJoinRow(lastMutationId: number | null) {
  return {
    entity: {
      id: "e1",
      shortId: "s1",
      name: "Momo",
      portraitUrl: null,
      pronouns: null,
      notes: "Secret owner notes",
      vitals: { base: 20, damage: 4 },
      narrative: {
        ancestry: null,
        background: null,
        backstory: null,
        personality: null,
        hopes: null,
        dreams: null,
        fears: null,
        secrets: "the leak this door must never serve",
        knives: [],
        chains: [],
      },
      identityVersion: 3,
      vitalsVersion: 7,
      inventoryVersion: 1,
      progressionVersion: 2,
    },
    lastMutationId,
  }
}

const request = {
  encounterId: "enc1",
  encounter: encounterIdentity,
  durable: [{ entityId: "e1", identity: durableIdentity }],
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: "c1" })
  loadEncounterEnvelopeById.mockReset().mockResolvedValue(encounterEnvelope)
  registered.mockReset()
  selectResults = [
    [{ encounter: encounterRow, lastMutationId: 4 }],
    [entityJoinRow(6)],
  ]
})

describe("loadCombatAcceptedAction", () => {
  it("gates campaign-DM via the encounter", async () => {
    await loadCombatAcceptedAction(request)
    expect(requireCampaignDM).toHaveBeenCalledWith("c1")
  })

  it("registers every requested identity — the bootstrap that licenses absent-row ⇒ unknown-client", async () => {
    await loadCombatAcceptedAction(request)
    expect(registered).toHaveBeenCalledWith({
      ...encounterIdentity,
      encounterId: "enc1",
      lastMutationId: 0,
    })
    expect(registered).toHaveBeenCalledWith([
      { ...durableIdentity, entityId: "e1", lastMutationId: 0 },
    ])
  })

  it("serves the storage-native encounter root: status + shell, one tuple", async () => {
    const result = await loadCombatAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const encounter = result.value.encounter!
    expect(encounter.through).toBe(4)
    expect(encounter.cursor).toBe(12)
    expect(encounter.value.status).toBe("live")
    expect(encounter.value.session.round).toBe(2)
    expect(
      encounter.value.session.participants.map((participant) => participant.id)
    ).toEqual(["p-goblin", "p-pc"])
  })

  it("serves inline entities whole — the row's own facts, behind the DM gate", async () => {
    const result = await loadCombatAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const goblin = result.value.encounter!.value.session.participants[0]!
    expect(goblin.entity).toEqual({
      storage: "inline",
      entity: { id: "goblin-1", components: goblinComponents },
    })
  })

  it("serves durable participants as REFERENCES only — never hydrated components", async () => {
    const result = await loadCombatAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const pc = result.value.encounter!.value.session.participants[1]!
    expect(pc.entity).toEqual({ storage: "durable", entityId: "e1" })
    // The atomicity invariant behind the shape: the encounter watermark and
    // version can never be paired with separately read entity state, because
    // no entity state exists in this tuple to pair.
    expect(JSON.stringify(result.value.encounter)).not.toContain("Momo")
  })

  it("errs invalid-session when the blob fails the shell refinement", async () => {
    selectResults = [
      [
        {
          encounter: {
            ...encounterRow,
            session: { ...storedSession, round: "not-a-round" },
          },
          lastMutationId: 4,
        },
      ],
    ]
    const result = await loadCombatAcceptedAction(request)
    expect(result).toEqual({ ok: false, error: "invalid-session" })
  })

  it("serves the durable root as the REDACTED combat narrowing — no narrative, no columns", async () => {
    const result = await loadCombatAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const durable = result.value.durable["e1"]!
    expect(durable.through).toBe(6)
    expect(durable.cursor).toEqual({
      identity: 3,
      vitals: 7,
      inventory: 1,
      progression: 2,
    })
    expect(durable.value.components.vitals).toEqual({ base: 20, damage: 4 })
    expect("narrative" in durable.value.components).toBe(false)
    expect("identity" in durable.value.components).toBe(false)
    expect("columns" in durable.value).toBe(false)
  })

  it("neither serves NOR registers an entity that is not a durable participant of this encounter", async () => {
    const result = await loadCombatAcceptedAction({
      ...request,
      durable: [{ entityId: "e-not-here", identity: durableIdentity }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.durable).toEqual({})
    // Only the encounter identity reached a ledger — an unadmitted entity
    // must not get a `replicaClient` row (registration is the push door's
    // license).
    expect(registered).toHaveBeenCalledTimes(1)
    expect(registered).toHaveBeenCalledWith({
      ...encounterIdentity,
      encounterId: "enc1",
      lastMutationId: 0,
    })
  })

  it("reads `through: 0` for freshly registered clients", async () => {
    selectResults = [
      [{ encounter: encounterRow, lastMutationId: null }],
      [entityJoinRow(null)],
    ]
    const result = await loadCombatAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.encounter!.through).toBe(0)
    expect(result.value.durable["e1"]!.through).toBe(0)
  })

  it("errs encounter-not-found before gating when the encounter is gone", async () => {
    loadEncounterEnvelopeById.mockResolvedValue(null)
    const result = await loadCombatAcceptedAction(request)
    expect(result).toEqual({ ok: false, error: "encounter-not-found" })
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("refuses a malformed request shape", async () => {
    const result = await loadCombatAcceptedAction({
      encounterId: "",
    } as never)
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })
})
