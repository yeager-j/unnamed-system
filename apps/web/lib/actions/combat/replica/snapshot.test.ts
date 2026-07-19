import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import { loadCombatAcceptedAction } from "./snapshot"

/**
 * The batched bootstrap door's mapping + security contract (UNN-646). The db
 * chain is stubbed (the per-root single-statement joins ARE the atomicity
 * argument and can only be exercised against Postgres — the real-DB door test
 * covers that); the real narrowing seam runs, so the redaction pins are
 * genuine.
 */
const requireCampaignDM = vi.fn()
const loadEncounterEnvelopeById = vi.fn()
const dissolveEncounterRow = vi.fn()
const registered = vi.fn()
let selectResults: unknown[][] = []

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (campaignId: string) => requireCampaignDM(campaignId),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterEnvelopeById: (id: string) => loadEncounterEnvelopeById(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  dissolveEncounterRow: (row: unknown) => dissolveEncounterRow(row),
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

const inlineIdentity = { clientGroupId: "combat-session:enc1", clientId: "t1" }
const durableIdentity = { clientGroupId: "combat-entity:e1", clientId: "t1" }

const encounterEnvelope = {
  id: "enc1",
  shortId: "es1",
  campaignId: "c1",
  status: "live",
}

const encounterRow = { id: "enc1", version: 12, session: {} }

const goblinComponents = {
  vitals: { base: 8, damage: 1 },
  narrative: { openDoors: ["a-secret"] },
}

function dissolvedWorld() {
  return {
    row: encounterRow,
    loaded: {
      session: {
        participants: [
          { id: "p-goblin", entity: { components: goblinComponents } },
          {
            id: "p-pc",
            entity: { components: { vitals: { base: 20, damage: 0 } } },
          },
        ],
      },
      locators: new Map([
        ["p-goblin", { storage: "inline", entity: { id: "x" } }],
        ["p-pc", { storage: "durable", entityId: "e1" }],
      ]),
    },
    durableVersions: new Map(),
    durableOwners: new Map(),
  }
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
  inline: inlineIdentity,
  durable: [{ entityId: "e1", identity: durableIdentity }],
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: "c1" })
  loadEncounterEnvelopeById.mockReset().mockResolvedValue(encounterEnvelope)
  dissolveEncounterRow.mockReset().mockResolvedValue(ok(dissolvedWorld()))
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
      ...inlineIdentity,
      encounterId: "enc1",
      lastMutationId: 0,
    })
    expect(registered).toHaveBeenCalledWith([
      { ...durableIdentity, entityId: "e1", lastMutationId: 0 },
    ])
  })

  it("serves the inline root: inline participants only, narrowed, with the encounter tuple", async () => {
    const result = await loadCombatAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const inline = result.value.inline!
    expect(inline.through).toBe(4)
    expect(inline.cursor).toBe(12)
    expect(Object.keys(inline.value.participants)).toEqual(["p-goblin"])
    expect(inline.value.participants["p-goblin"]).toEqual({
      vitals: { base: 8, damage: 1 },
    })
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

  it("serves nothing for an entity that is not a durable participant of this encounter", async () => {
    const result = await loadCombatAcceptedAction({
      ...request,
      durable: [{ entityId: "e-not-here", identity: durableIdentity }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.durable).toEqual({})
  })

  it("reads `through: 0` for freshly registered clients", async () => {
    selectResults = [
      [{ encounter: encounterRow, lastMutationId: null }],
      [entityJoinRow(null)],
    ]
    const result = await loadCombatAcceptedAction(request)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.inline!.through).toBe(0)
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
