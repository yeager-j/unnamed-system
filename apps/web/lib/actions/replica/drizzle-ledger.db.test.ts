import { randomUUID } from "node:crypto"
import { inArray } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"

import { storedSessionSchema } from "@workspace/game-v2/encounter"
import { emptyMapInstance } from "@workspace/game-v2/spatial"
import type {
  MutationDedupAdapter,
  RecordedOutcome,
} from "@workspace/replica/server"
import { ok } from "@workspace/result"

import { getDb, type WriteExecutor } from "@/lib/db/client"
import { campaigns } from "@/lib/db/schema/campaign"
import { encounters } from "@/lib/db/schema/encounter"
import { encounterReplicaClient } from "@/lib/db/schema/encounter-replica-client"
import { entity } from "@/lib/db/schema/entity"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { replicaClient } from "@/lib/db/schema/replica-client"
import { users } from "@/lib/db/schema/user"

import {
  createDrizzleMutationDedupAdapter,
  REPLICA_DEDUP_TTL_MS,
} from "./drizzle-ledger"

if (!process.env.DATABASE_URL) {
  throw new Error(
    "test:replica-db requires DATABASE_URL for an isolated migrated Postgres database"
  )
}

interface LedgerCase {
  readonly name: string
  createPins(): Promise<readonly [string, string]>
  insertRows(
    primaryPin: string,
    otherPin: string,
    rows: ReadonlyArray<{
      readonly clientGroupId: string
      readonly clientId: string
      readonly pin: "primary" | "other"
      readonly updatedAt: Date
    }>
  ): Promise<void>
  createAdapter(
    pinValue: string
  ): MutationDedupAdapter<WriteExecutor, unknown, string>
  listClientIds(): Promise<ReadonlyArray<string>>
  readonly recordedOutcome: RecordedOutcome<unknown, string>
}

const entityIds: string[] = []
const encounterIds: string[] = []
const campaignIds: string[] = []
const mapInstanceIds: string[] = []
const userIds: string[] = []

async function createEntityPins(): Promise<readonly [string, string]> {
  const suffix = randomUUID().slice(0, 8)
  const rows = ["primary", "other"].map((kind) => ({
    id: `ledger-entity-${kind}-${suffix}`,
    shortId: `ledger-entity-${kind}-${suffix}`,
    name: `Ledger ${kind} ${suffix}`,
  }))
  await getDb().insert(entity).values(rows)
  entityIds.push(...rows.map((row) => row.id))
  return [rows[0]!.id, rows[1]!.id]
}

async function createEncounterPins(): Promise<readonly [string, string]> {
  const suffix = randomUUID().slice(0, 8)
  const userId = `ledger-user-${suffix}`
  const campaignId = `ledger-campaign-${suffix}`
  const instances = ["primary", "other"].map((kind) => ({
    id: `ledger-instance-${kind}-${suffix}`,
    state: emptyMapInstance(),
    version: 0,
  }))
  const session = storedSessionSchema.parse({
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: [],
  })
  const rows = instances.map((instance, index) => {
    const kind = index === 0 ? "primary" : "other"
    return {
      id: `ledger-encounter-${kind}-${suffix}`,
      shortId: `ledger-encounter-${kind}-${suffix}`,
      campaignId,
      name: `Ledger ${kind} ${suffix}`,
      mapInstanceId: instance.id,
      status: "live" as const,
      session,
      version: 0,
    }
  })

  await getDb()
    .insert(users)
    .values({
      id: userId,
      email: `ledger-${suffix}@example.test`,
    })
  await getDb()
    .insert(campaigns)
    .values({
      id: campaignId,
      shortId: campaignId,
      joinToken: `ledger-join-${suffix}`,
      dmUserId: userId,
      name: `Ledger ${suffix}`,
    })
  await getDb().insert(mapInstances).values(instances)
  await getDb().insert(encounters).values(rows)

  userIds.push(userId)
  campaignIds.push(campaignId)
  mapInstanceIds.push(...instances.map((instance) => instance.id))
  encounterIds.push(...rows.map((row) => row.id))
  return [rows[0]!.id, rows[1]!.id]
}

const cases: ReadonlyArray<LedgerCase> = [
  {
    name: "entity ledger",
    createPins: createEntityPins,
    async insertRows(primaryPin, otherPin, rows) {
      await getDb()
        .insert(replicaClient)
        .values(
          rows.map((row) => ({
            clientGroupId: row.clientGroupId,
            clientId: row.clientId,
            entityId: row.pin === "primary" ? primaryPin : otherPin,
            lastMutationId: 1,
            updatedAt: row.updatedAt,
          }))
        )
    },
    createAdapter: (pinValue) =>
      createDrizzleMutationDedupAdapter<unknown, string, typeof replicaClient>({
        table: replicaClient,
        pinColumn: replicaClient.entityId,
        pinValue,
      }),
    async listClientIds() {
      const rows = await getDb()
        .select({ clientId: replicaClient.clientId })
        .from(replicaClient)
      return rows.map((row) => row.clientId)
    },
    recordedOutcome: ok(undefined),
  },
  {
    name: "encounter ledger",
    createPins: createEncounterPins,
    async insertRows(primaryPin, otherPin, rows) {
      await getDb()
        .insert(encounterReplicaClient)
        .values(
          rows.map((row) => ({
            clientGroupId: row.clientGroupId,
            clientId: row.clientId,
            encounterId: row.pin === "primary" ? primaryPin : otherPin,
            lastMutationId: 1,
            updatedAt: row.updatedAt,
          }))
        )
    },
    createAdapter: (pinValue) =>
      createDrizzleMutationDedupAdapter<
        unknown,
        string,
        typeof encounterReplicaClient
      >({
        table: encounterReplicaClient,
        pinColumn: encounterReplicaClient.encounterId,
        pinValue,
      }),
    async listClientIds() {
      const rows = await getDb()
        .select({ clientId: encounterReplicaClient.clientId })
        .from(encounterReplicaClient)
      return rows.map((row) => row.clientId)
    },
    recordedOutcome: ok({ version: 7 }),
  },
]

describe.each(cases)("createDrizzleMutationDedupAdapter — $name", (ledger) => {
  it("locks and overwrites the outcome, throws on pin mismatch, and sweeps only stale siblings on the same pin", async () => {
    const [primaryPin, otherPin] = await ledger.createPins()
    const suffix = randomUUID().slice(0, 8)
    const clientGroupId = `ledger-group-${suffix}`
    const current = { clientGroupId, clientId: `current-${suffix}` }
    const staleSame = { clientGroupId, clientId: `stale-same-${suffix}` }
    const staleOther = { clientGroupId, clientId: `stale-other-${suffix}` }
    const staleAt = new Date(Date.now() - REPLICA_DEDUP_TTL_MS - 60_000)

    await ledger.insertRows(primaryPin, otherPin, [
      { ...current, pin: "primary", updatedAt: new Date() },
      { ...staleSame, pin: "primary", updatedAt: staleAt },
      { ...staleOther, pin: "other", updatedAt: staleAt },
    ])

    const adapter = ledger.createAdapter(primaryPin)
    const missing = await getDb().transaction((tx) =>
      adapter.acquire(tx, {
        clientGroupId,
        clientId: `missing-${suffix}`,
      })
    )
    const acquired = await getDb().transaction(async (tx) => {
      await adapter.record(tx, current, 2, ledger.recordedOutcome)
      return adapter.acquire(tx, current)
    })

    expect(missing).toBeNull()
    expect(acquired).toEqual({
      lastMutationId: 2,
      lastOutcome: ledger.recordedOutcome,
    })
    await expect(
      getDb().transaction((tx) =>
        ledger.createAdapter(otherPin).acquire(tx, current)
      )
    ).rejects.toThrow("pinned to another root")

    const remaining = await ledger.listClientIds()
    expect(remaining).toContain(current.clientId)
    expect(remaining).not.toContain(staleSame.clientId)
    expect(remaining).toContain(staleOther.clientId)
  })
})

afterAll(async () => {
  const db = getDb()
  if (encounterIds.length > 0) {
    await db.delete(encounters).where(inArray(encounters.id, encounterIds))
  }
  if (entityIds.length > 0) {
    await db.delete(entity).where(inArray(entity.id, entityIds))
  }
  if (mapInstanceIds.length > 0) {
    await db
      .delete(mapInstances)
      .where(inArray(mapInstances.id, mapInstanceIds))
  }
  if (campaignIds.length > 0) {
    await db.delete(campaigns).where(inArray(campaigns.id, campaignIds))
  }
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds))
  }
})
