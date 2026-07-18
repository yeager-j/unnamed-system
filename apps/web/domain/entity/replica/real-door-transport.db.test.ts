import { randomUUID } from "node:crypto"
import { eq, inArray, sql } from "drizzle-orm"
import { afterAll, describe, expect, it, vi } from "vitest"

import type { MutationEnvelope } from "@workspace/replica"
import {
  TRANSPORT_CONTRACT_LAW_NAMES,
  verifyTransportContract,
  type PushPrime,
  type ReadGate,
  type TransportContractScenario,
} from "@workspace/replica/testing"
import type { PushError } from "@workspace/replica/transport"
import { ok, type Result } from "@workspace/result"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { pushEntityMutationAction } from "@/lib/actions/entity/replica/push"
import {
  loadEntityAcceptedAction,
  type EntityAccepted,
} from "@/lib/actions/entity/replica/snapshot"
import { getDb } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"
import { playerCharacter } from "@/lib/db/schema/player-character"
import { insertSeedEntity } from "@/lib/db/seed-entity"
import { createEntityReplicaSource } from "@/lib/sync/entity-replica-source"

import type { EntityVersionVector } from "./cursor"
import { setEntityColumn, type EntityReplicaInvocation } from "./mutations"
import type { EntityReplicaRejection } from "./rejection"
import { createEntityReplicaTransport } from "./transport"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/auth/campaign-access", async () => {
  const { ok } = await import("@workspace/result")
  return {
    requireEntityOwner: vi.fn(async () => undefined),
    authorizeEntityWriteForClass: vi.fn(async () => ok({})),
  }
})

vi.mock("@/lib/actions/entity/revalidate", () => ({
  revalidateEntity: vi.fn(),
  revalidateCharacterList: vi.fn(),
}))

vi.mock("@/lib/actions/entity/archetype-unlock-gate", async () => {
  const { ok } = await import("@workspace/result")
  return { checkArchetypeUnlockGates: vi.fn(async () => ok(undefined)) }
})

vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: vi.fn(),
}))

if (!process.env.DATABASE_URL) {
  throw new Error(
    "test:replica-db requires DATABASE_URL for an isolated migrated Postgres database"
  )
}

const OWNER_ID = "dev-user-claude"
const entityIds: string[] = []

type Scenario = TransportContractScenario<
  EntityAccepted["value"],
  EntityReplicaInvocation,
  EntityReplicaRejection,
  void,
  EntityVersionVector
>

interface HeldRead {
  released: boolean
  resolve(): void
}

async function createFixture(): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  const seed = makeSeedCharacter({
    slug: `replica-law-${suffix}`,
    shortId: `replica-law-${suffix}`,
    name: `Replica Law ${suffix}`,
  })
  const entityId = await insertSeedEntity(seed, OWNER_ID, null)
  entityIds.push(entityId)
  return entityId
}

async function acceptedFor(
  entityId: string,
  identity: { clientGroupId: string; clientId: string }
): Promise<EntityAccepted> {
  const result = await loadEntityAcceptedAction({ entityId, ...identity })
  if (!result.ok) {
    throw new Error(`accepted snapshot refused: ${result.error}`)
  }
  return result.value
}

async function identityVersion(entityId: string): Promise<number> {
  const [row] = await getDb()
    .select({ version: entity.identityVersion })
    .from(entity)
    .where(eq(entity.id, entityId))
  if (!row) throw new Error(`missing replica fixture ${entityId}`)
  return row.version
}

async function createRealDoorScenario(): Promise<Scenario> {
  const entityId = await createFixture()
  const identity = {
    clientGroupId: `entity-${entityId}`,
    clientId: `tab-${randomUUID()}`,
  }
  const observations: EntityAccepted[] = []
  const received: MutationEnvelope<EntityReplicaInvocation>[] = []
  const executed: MutationEnvelope<EntityReplicaInvocation>[] = []
  const handlers = new Set<{ onPing(): void; onReconnect(): void }>()
  const held: HeldRead[] = []
  let latest = await acceptedFor(entityId, identity)
  let external = 0
  let nextPrime: PushPrime<EntityReplicaRejection> | undefined
  let readsGated = false
  let severed = false
  let incomparableNext = false
  observations.push(latest)

  const productionSource = createEntityReplicaSource({
    entityId,
    identity,
    subscribe(events) {
      handlers.add(events)
      return () => handlers.delete(events)
    },
  })

  const source = {
    async fetchAccepted(signal: AbortSignal): Promise<EntityAccepted> {
      if (severed) throw new Error("database source severed")
      let snapshot = await productionSource.fetchAccepted(signal)
      if (incomparableNext) {
        incomparableNext = false
        snapshot = {
          ...snapshot,
          cursor: {
            ...snapshot.cursor,
            identity: (snapshot.cursor.identity ?? 0) + 1,
            vitals: Math.max(0, (snapshot.cursor.vitals ?? 1) - 1),
          },
        }
      }
      latest = snapshot
      observations.push(snapshot)
      if (!readsGated) return snapshot
      return new Promise<EntityAccepted>((resolve) => {
        held.push({
          released: false,
          resolve: () => resolve(snapshot),
        })
      })
    },

    async pushEnvelope(
      envelope: MutationEnvelope<EntityReplicaInvocation>,
      signal: AbortSignal
    ): Promise<Result<void, PushError<EntityReplicaRejection>>> {
      received.push(envelope)
      const primed = nextPrime
      nextPrime = undefined
      if (primed?.kind === "ambiguous-dropped") {
        throw new Error("request dropped before Postgres")
      }
      if (primed?.kind === "reject") {
        return {
          ok: false,
          error: { kind: "rejected", error: primed.error },
        }
      }

      const before = await identityVersion(entityId)
      const result = await productionSource.pushEnvelope(envelope, signal)
      const after = await identityVersion(entityId)
      if (after > before) executed.push(envelope)
      if (primed?.kind === "ambiguous-committed") {
        throw new Error("response lost after Postgres commit")
      }
      return result
    },

    subscribe: productionSource.subscribe,
  }

  const advance = async (): Promise<void> => {
    external += 1
    await getDb()
      .update(entity)
      .set({
        name: `External ${external}`,
        identityVersion: sql`${entity.identityVersion} + 1`,
      })
      .where(eq(entity.id, entityId))
  }

  const gateReads = (): ReadGate => {
    readsGated = true
    return {
      count: () => held.length,
      async release(index) {
        const entry = held[index]
        if (entry && !entry.released) {
          entry.released = true
          entry.resolve()
        }
      },
      async releaseAll() {
        for (const entry of held) {
          if (!entry.released) {
            entry.released = true
            entry.resolve()
          }
        }
      },
    }
  }

  return {
    transport: createEntityReplicaTransport({ source, initial: latest }),
    rejectionError: "capability-missing",
    authoritative: () => latest,
    observations: () => [...observations],
    advance,
    signal: () => {
      for (const handler of [...handlers]) handler.onPing()
    },
    makeEnvelope: () => ({
      ...identity,
      mutationId: 1,
      invocation: setEntityColumn({
        column: "name",
        value: `Mutation ${entityId.slice(-8)}`,
      }),
    }),
    received: () => [...received],
    executed: () => [...executed],
    primePush: (outcome) => {
      nextPrime = outcome
    },
    gateReads,
    sever: () => {
      severed = true
    },
    restore: () => {
      severed = false
      for (const handler of [...handlers]) handler.onReconnect()
    },
    advanceIncomparable: () => {
      incomparableNext = true
    },
  }
}

afterAll(async () => {
  if (entityIds.length === 0) return
  await getDb()
    .delete(playerCharacter)
    .where(inArray(playerCharacter.entityId, entityIds))
  await getDb().delete(entity).where(inArray(entity.id, entityIds))
})

describe("transport contract — real entity doors + Postgres", () => {
  const laws = verifyTransportContract({ create: createRealDoorScenario })

  it("covers the complete transport law set", () => {
    expect(laws.map((law) => law.name)).toEqual([
      ...TRANSPORT_CONTRACT_LAW_NAMES,
    ])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("entity replica SQL serialization", () => {
  it("executes two concurrent deliveries of one envelope exactly once", async () => {
    const entityId = await createFixture()
    const identity = {
      clientGroupId: `entity-${entityId}`,
      clientId: `tab-${randomUUID()}`,
    }
    const initial = await acceptedFor(entityId, identity)
    const envelope = {
      ...identity,
      mutationId: 1,
      invocation: setEntityColumn({
        column: "name",
        value: "Serialized once",
      }),
    }

    const results = await Promise.all([
      pushEntityMutationAction({ entityId, envelope }),
      pushEntityMutationAction({ entityId, envelope }),
    ])
    const final = await acceptedFor(entityId, identity)

    expect(results).toEqual([ok(undefined), ok(undefined)])
    expect(final.value.columns.name).toBe("Serialized once")
    expect(final.through).toBe(1)
    expect(final.cursor.identity).toBe((initial.cursor.identity ?? 0) + 1)
  })
})
