import { randomUUID } from "node:crypto"
import { eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  defaultOverlay,
  storedSessionSchema,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { emptyMapInstance } from "@workspace/game-v2/spatial"
import type { MutationEnvelope } from "@workspace/replica"
import {
  TRANSPORT_CONTRACT_LAW_NAMES,
  verifyTransportContract,
  type PushPrime,
  type ReadGate,
  type TransportContractScenario,
} from "@workspace/replica/testing"
import {
  classifyScalarCursor,
  createPullTransport,
  type PushError,
} from "@workspace/replica/transport"
import { err, ok, type Result } from "@workspace/result"

import { instantiateEnemy } from "@/domain/game-engine-v2"
import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import {
  pushCombatDurableMutationAction,
  pushCombatSessionMutationAction,
} from "@/lib/actions/combat/replica/push"
import {
  loadCombatAcceptedAction,
  type CombatDurableAccepted,
  type EncounterAccepted,
} from "@/lib/actions/combat/replica/snapshot"
import { getDb } from "@/lib/db/client"
import { campaigns } from "@/lib/db/schema/campaign"
import { encounters } from "@/lib/db/schema/encounter"
import { encounterReplicaClient } from "@/lib/db/schema/encounter-replica-client"
import { entity } from "@/lib/db/schema/entity"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { playerCharacter } from "@/lib/db/schema/player-character"
import { replicaClient } from "@/lib/db/schema/replica-client"
import { insertSeedEntity } from "@/lib/db/seed-entity"
import {
  createCombatDurableSource,
  createEncounterSource,
} from "@/lib/sync/combat-replica-source"

import {
  compareEntityVersionVectors,
  type EntityVersionVector,
} from "../../entity/replica/cursor"
import {
  adjustEncounterCounter,
  endEncounterTurn,
  setEncounterParticipantSide,
  writeCombatEntity,
  writeEncounterInline,
  type CombatDurableInvocation,
  type CombatDurableState,
  type EncounterInvocation,
  type EncounterReplicaState,
} from "./mutations"
import type { CombatReplicaRejection } from "./rejection"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/auth/campaign-access", async () => {
  const { ok } = await import("@workspace/result")
  return {
    requireCampaignDM: vi.fn(async () => ({})),
    authorizeEntityWriteForClass: vi.fn(async () => ok({ campaignId: null })),
    authorizeCampaignDMForEncounter: vi.fn(async (encounterId: string) => {
      const { loadEncounterEnvelopeById } =
        await import("@/lib/db/queries/load-encounter")
      const envelope = await loadEncounterEnvelopeById(encounterId)
      if (!envelope) return { ok: false, error: "encounter-not-found" }
      return ok(envelope)
    }),
  }
})

vi.mock("@/lib/actions/entity/revalidate", () => ({
  revalidateEntity: vi.fn(),
  revalidateCharacterList: vi.fn(),
}))

vi.mock("@/lib/actions/encounter/revalidate", () => ({
  revalidateEncounter: vi.fn(),
}))

vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: vi.fn(),
  publishEncounterPing: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

if (!process.env.DATABASE_URL) {
  throw new Error(
    "test:replica-db requires DATABASE_URL for an isolated migrated Postgres database"
  )
}

const OWNER_ID = "dev-user-claude"
const damage = (amount: number) =>
  ({ component: "vitals", op: "damage", amount }) as const

const entityIds: string[] = []
const encounterIds: string[] = []
const campaignIds: string[] = []
const instanceIds: string[] = []

interface CombatFixture {
  encounterId: string
  pcEntityId: string
  inlineParticipantId: ReturnType<typeof asParticipantId>
}

/** A campaign + one placed PC (durable participant) + one inline enemy in a
 *  live encounter — the smallest world both combat doors can write. */
async function createFixture(): Promise<CombatFixture> {
  const suffix = randomUUID().slice(0, 8)
  const db = getDb()

  const campaignId = `replica-camp-${suffix}`
  await db.insert(campaigns).values({
    id: campaignId,
    shortId: `replica-camp-${suffix}`,
    joinToken: `replica-join-${suffix}`,
    dmUserId: OWNER_ID,
    name: `Combat Replica ${suffix}`,
  })
  campaignIds.push(campaignId)

  const seed = makeSeedCharacter({
    slug: `combat-law-${suffix}`,
    shortId: `combat-law-${suffix}`,
    name: `Combat Law ${suffix}`,
  })
  const pcEntityId = await insertSeedEntity(seed, OWNER_ID, campaignId)
  entityIds.push(pcEntityId)

  const instanceId = `replica-mi-${suffix}`
  await db.insert(mapInstances).values({
    id: instanceId,
    state: emptyMapInstance(),
    version: 0,
  })
  instanceIds.push(instanceId)

  const pcParticipantId = asParticipantId(`p-pc-${suffix}`)
  const inlineParticipantId = asParticipantId(`p-goblin-${suffix}`)
  const enemy = instantiateEnemy("goblin", `inline-${suffix}`)
  if (!enemy) throw new Error("goblin missing from the enemy catalog")
  const session: StoredSession = storedSessionSchema.parse({
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: [
      {
        id: pcParticipantId,
        locator: { storage: "durable", entityId: pcEntityId },
        overlay: defaultOverlay({ side: "players" }),
      },
      {
        id: inlineParticipantId,
        locator: {
          storage: "inline",
          entity: { id: enemy.id, components: enemy.components },
        },
        overlay: defaultOverlay({ side: "enemies" }),
      },
    ],
  })

  const encounterId = `replica-enc-${suffix}`
  await db.insert(encounters).values({
    id: encounterId,
    shortId: `replica-enc-${suffix}`,
    campaignId,
    name: `Combat Replica ${suffix}`,
    status: "live",
    session,
    mapInstanceId: instanceId,
    version: 0,
  })
  encounterIds.push(encounterId)

  return { encounterId, pcEntityId, inlineParticipantId }
}

interface HeldRead {
  released: boolean
  resolve(): void
}

/** The generic scenario harness both door pairs share: gateable reads,
 *  severable network, push priming, executed-detection by version delta. */
function scenarioControls<Accepted>(options: {
  fetch(): Promise<Accepted>
  doctor(accepted: Accepted): Accepted
}) {
  const observations: Accepted[] = []
  const handlers = new Set<() => void>()
  const held: HeldRead[] = []
  let readsGated = false
  let severed = false
  let incomparableNext = false
  let latest: Accepted | null = null

  return {
    observations,
    handlers,
    latest: () => {
      if (latest === null) throw new Error("no observation yet")
      return latest
    },
    seed: (accepted: Accepted) => {
      latest = accepted
      observations.push(accepted)
    },
    async fetchAccepted(): Promise<Accepted> {
      if (severed) throw new Error("database source severed")
      let snapshot = (await options.fetch()) as Accepted
      if (incomparableNext) {
        incomparableNext = false
        snapshot = options.doctor(snapshot)
      }
      latest = snapshot
      observations.push(snapshot)
      if (!readsGated) return snapshot
      return new Promise<Accepted>((resolve) => {
        held.push({
          released: false,
          resolve: () => resolve(snapshot as Awaited<Accepted>),
        })
      })
    },
    subscribe(invalidate: () => void) {
      handlers.add(invalidate)
      return () => handlers.delete(invalidate)
    },
    signal: () => {
      for (const handler of [...handlers]) handler()
    },
    gateReads: (): ReadGate => {
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
    },
    sever: () => {
      severed = true
    },
    restore: () => {
      severed = false
      for (const handler of [...handlers]) handler()
    },
    markIncomparable: () => {
      incomparableNext = true
    },
  }
}

// ── Durable door ─────────────────────────────────────────────────────────────

type DurableScenario = TransportContractScenario<
  CombatDurableState,
  CombatDurableInvocation,
  CombatReplicaRejection,
  void,
  EntityVersionVector
>

async function vitalsVersion(entityId: string): Promise<number> {
  const [row] = await getDb()
    .select({ version: entity.vitalsVersion })
    .from(entity)
    .where(eq(entity.id, entityId))
  if (!row) throw new Error(`missing combat fixture ${entityId}`)
  return row.version
}

async function createDurableDoorScenario(): Promise<DurableScenario> {
  const fixture = await createFixture()
  const { encounterId, pcEntityId } = fixture
  const identity = {
    clientGroupId: `combat-entity:${pcEntityId}`,
    clientId: `tab-${randomUUID()}`,
  }
  const received: MutationEnvelope<CombatDurableInvocation>[] = []
  const executed: MutationEnvelope<CombatDurableInvocation>[] = []
  let nextPrime: PushPrime<CombatReplicaRejection> | undefined
  let external = 0

  const fetchDurable = async (): Promise<CombatDurableAccepted> => {
    const result = await loadCombatAcceptedAction({
      encounterId,
      durable: [{ entityId: pcEntityId, identity }],
    })
    if (!result.ok) throw new Error(`accepted refused: ${result.error}`)
    const accepted = result.value.durable[pcEntityId]
    if (!accepted) throw new Error("entity not served")
    return accepted
  }

  const controls = scenarioControls<CombatDurableAccepted>({
    fetch: fetchDurable,
    doctor: (accepted) => ({
      ...accepted,
      cursor: {
        ...accepted.cursor,
        identity: (accepted.cursor.identity ?? 0) + 1,
        vitals: 0,
      },
    }),
  })
  controls.seed(await fetchDurable())

  const production = createCombatDurableSource({
    encounterId,
    entityId: pcEntityId,
    identity,
    subscribe: controls.subscribe,
  })

  const source = {
    fetchAccepted: (signal: AbortSignal) => {
      void signal
      return controls.fetchAccepted()
    },
    async pushEnvelope(
      envelope: MutationEnvelope<CombatDurableInvocation>,
      signal: AbortSignal
    ): Promise<Result<void, PushError<CombatReplicaRejection>>> {
      received.push(envelope)
      const primed = nextPrime
      nextPrime = undefined
      if (primed?.kind === "ambiguous-dropped") {
        throw new Error("request dropped before Postgres")
      }
      if (primed?.kind === "reject") {
        return { ok: false, error: { kind: "rejected", error: primed.error } }
      }
      const before = await vitalsVersion(pcEntityId)
      const result = await production.pushEnvelope(envelope, signal)
      const after = await vitalsVersion(pcEntityId)
      if (after > before) executed.push(envelope)
      if (primed?.kind === "ambiguous-committed") {
        throw new Error("response lost after Postgres commit")
      }
      return result
    },
    subscribe: controls.subscribe,
  }

  return {
    transport: createPullTransport({
      source,
      initial: controls.latest(),
      classify: compareEntityVersionVectors,
    }),
    rejectionError: "capability-missing",
    authoritative: () => controls.latest(),
    observations: () => [...controls.observations],
    advance: async () => {
      external += 1
      await getDb()
        .update(entity)
        .set({
          vitals: { base: 20, damage: external },
          vitalsVersion: sql`${entity.vitalsVersion} + 1`,
        })
        .where(eq(entity.id, pcEntityId))
    },
    signal: controls.signal,
    makeEnvelope: () => ({
      ...identity,
      mutationId: 1,
      invocation: writeCombatEntity(damage(1)),
    }),
    received: () => [...received],
    executed: () => [...executed],
    primePush: (outcome) => {
      nextPrime = outcome
    },
    gateReads: controls.gateReads,
    sever: controls.sever,
    restore: controls.restore,
    advanceIncomparable: controls.markIncomparable,
  }
}

// ── Session door ─────────────────────────────────────────────────────────────

type SessionScenario = TransportContractScenario<
  EncounterReplicaState,
  EncounterInvocation,
  CombatReplicaRejection,
  { version: number },
  number
>

async function encounterVersion(encounterId: string): Promise<number> {
  const [row] = await getDb()
    .select({ version: encounters.version })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
  if (!row) throw new Error(`missing combat fixture ${encounterId}`)
  return row.version
}

async function createSessionDoorScenario(): Promise<SessionScenario> {
  const fixture = await createFixture()
  const { encounterId, inlineParticipantId } = fixture
  const identity = {
    clientGroupId: `encounter:${encounterId}`,
    clientId: `tab-${randomUUID()}`,
  }
  const received: MutationEnvelope<EncounterInvocation>[] = []
  const executed: MutationEnvelope<EncounterInvocation>[] = []
  let nextPrime: PushPrime<CombatReplicaRejection> | undefined

  const fetchEncounter = async (): Promise<EncounterAccepted> => {
    const result = await loadCombatAcceptedAction({
      encounterId,
      encounter: identity,
    })
    if (!result.ok) throw new Error(`accepted refused: ${result.error}`)
    if (!result.value.encounter) throw new Error("no encounter root")
    return result.value.encounter
  }

  const controls = scenarioControls<EncounterAccepted>({
    fetch: fetchEncounter,
    // Scalar cursors are totally ordered; the capability is omitted below.
    doctor: (accepted) => accepted,
  })
  controls.seed(await fetchEncounter())

  const production = createEncounterSource({
    encounterId,
    identity,
    subscribe: controls.subscribe,
  })

  const source = {
    fetchAccepted: (signal: AbortSignal) => {
      void signal
      return controls.fetchAccepted()
    },
    async pushEnvelope(
      envelope: MutationEnvelope<EncounterInvocation>,
      signal: AbortSignal
    ): Promise<Result<{ version: number }, PushError<CombatReplicaRejection>>> {
      received.push(envelope)
      const primed = nextPrime
      nextPrime = undefined
      if (primed?.kind === "ambiguous-dropped") {
        throw new Error("request dropped before Postgres")
      }
      if (primed?.kind === "reject") {
        return { ok: false, error: { kind: "rejected", error: primed.error } }
      }
      const before = await encounterVersion(encounterId)
      const result = await production.pushEnvelope(envelope, signal)
      const after = await encounterVersion(encounterId)
      if (after > before) executed.push(envelope)
      if (primed?.kind === "ambiguous-committed") {
        throw new Error("response lost after Postgres commit")
      }
      return result
    },
    subscribe: controls.subscribe,
  }

  return {
    transport: createPullTransport({
      source,
      initial: controls.latest(),
      classify: classifyScalarCursor,
    }),
    rejectionError: "participant-not-found",
    authoritative: () => controls.latest(),
    observations: () => [...controls.observations],
    advance: async () => {
      // A classic event-wire writer bumping the same row's version.
      await getDb()
        .update(encounters)
        .set({ version: sql`${encounters.version} + 1` })
        .where(eq(encounters.id, encounterId))
    },
    signal: controls.signal,
    makeEnvelope: () => ({
      ...identity,
      mutationId: 1,
      invocation: adjustEncounterCounter({
        participantId: inlineParticipantId,
        counter: "lumina",
        delta: 1,
      }),
    }),
    received: () => [...received],
    executed: () => [...executed],
    primePush: (outcome) => {
      nextPrime = outcome
    },
    gateReads: controls.gateReads,
    sever: controls.sever,
    restore: controls.restore,
  }
}

afterAll(async () => {
  const db = getDb()
  if (encounterIds.length > 0) {
    await db
      .delete(encounterReplicaClient)
      .where(inArray(encounterReplicaClient.encounterId, encounterIds))
    await db.delete(encounters).where(inArray(encounters.id, encounterIds))
  }
  if (instanceIds.length > 0) {
    await db.delete(mapInstances).where(inArray(mapInstances.id, instanceIds))
  }
  if (entityIds.length > 0) {
    await db
      .delete(playerCharacter)
      .where(inArray(playerCharacter.entityId, entityIds))
    await db.delete(entity).where(inArray(entity.id, entityIds))
  }
  if (campaignIds.length > 0) {
    await db.delete(campaigns).where(inArray(campaigns.id, campaignIds))
  }
})

describe("transport contract — real combat durable door + Postgres", () => {
  const laws = verifyTransportContract({ create: createDurableDoorScenario })

  it("covers the complete transport law set", () => {
    expect(laws.map((law) => law.name)).toEqual([
      ...TRANSPORT_CONTRACT_LAW_NAMES,
    ])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("transport contract — real encounter door + Postgres", () => {
  const laws = verifyTransportContract({
    create: createSessionDoorScenario,
    omit: ["incomparable-cursors"],
  })

  it("covers every law except the impossible incomparable-cursor case", () => {
    const omitted = new Set([
      "recovers rather than guessing when cursors are incomparable",
    ])
    expect(laws.map((law) => law.name)).toEqual(
      TRANSPORT_CONTRACT_LAW_NAMES.filter((name) => !omitted.has(name))
    )
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})

describe("combat replica SQL serialization", () => {
  it("durable door: two concurrent deliveries of one envelope execute once", async () => {
    const { encounterId, pcEntityId } = await createFixture()
    const identity = {
      clientGroupId: `combat-entity:${pcEntityId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({
      encounterId,
      durable: [{ entityId: pcEntityId, identity }],
    })
    const before = await vitalsVersion(pcEntityId)
    const envelope = {
      ...identity,
      mutationId: 1,
      invocation: writeCombatEntity(damage(3)),
    }

    const results = await Promise.all([
      pushCombatDurableMutationAction({
        encounterId,
        entityId: pcEntityId,
        envelope,
      }),
      pushCombatDurableMutationAction({
        encounterId,
        entityId: pcEntityId,
        envelope,
      }),
    ])

    expect(results).toEqual([ok(undefined), ok(undefined)])
    expect(await vitalsVersion(pcEntityId)).toBe(before + 1)
  })

  it("session door: a duplicate reproduces the recorded Remote; a classic bump stays monotone", async () => {
    const { encounterId, inlineParticipantId } = await createFixture()
    const identity = {
      clientGroupId: `encounter:${encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({ encounterId, encounter: identity })
    const envelope = {
      ...identity,
      mutationId: 1,
      invocation: writeEncounterInline({
        participantId: inlineParticipantId,
        write: damage(2),
      }),
    }

    const [first, second] = await Promise.all([
      pushCombatSessionMutationAction({ encounterId, envelope }),
      pushCombatSessionMutationAction({ encounterId, envelope }),
    ])
    expect(first).toEqual(ok({ version: 1 }))
    expect(second).toEqual(ok({ version: 1 }))
    expect(await encounterVersion(encounterId)).toBe(1)

    // A classic event-wire writer bumps the same row; the next replica
    // commit reads the fresh version under its lock — monotone, no guard
    // fight between the two protocols.
    await getDb()
      .update(encounters)
      .set({ version: sql`${encounters.version} + 1` })
      .where(eq(encounters.id, encounterId))
    const third = await pushCombatSessionMutationAction({
      encounterId,
      envelope: { ...envelope, mutationId: 2 },
    })
    expect(third).toEqual(ok({ version: 3 }))
  })
})

/**
 * The storage-native tuple's atomicity claim (UNN-655): the encounter value
 * contains ONLY facts stored under the encounter row — durable participants
 * as references — so the watermark/version can never be paired with
 * separately hydrated stale entity state, and an inline commit moves value
 * and cursor together in one observation.
 */
describe("encounter accepted-tuple atomicity", () => {
  it("is byte-identical across a durable entity-row write; durable participants stay references", async () => {
    const { encounterId, pcEntityId } = await createFixture()
    const identity = {
      clientGroupId: `encounter:${encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    const first = await loadCombatAcceptedAction({
      encounterId,
      encounter: identity,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // A durable write lands on the ENTITY row — the encounter root must not
    // observe it in any dimension: not value, not watermark, not cursor.
    await getDb()
      .update(entity)
      .set({
        vitals: { base: 20, damage: 13 },
        vitalsVersion: sql`${entity.vitalsVersion} + 1`,
      })
      .where(eq(entity.id, pcEntityId))

    const second = await loadCombatAcceptedAction({
      encounterId,
      encounter: identity,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(JSON.stringify(second.value.encounter)).toBe(
      JSON.stringify(first.value.encounter)
    )

    const pc = first.value.encounter!.value.session.participants.find(
      (participant) => participant.entity.storage === "durable"
    )
    expect(pc?.entity).toEqual({ storage: "durable", entityId: pcEntityId })
  })

  it("moves value and cursor together for an inline commit", async () => {
    const { encounterId, inlineParticipantId } = await createFixture()
    const identity = {
      clientGroupId: `encounter:${encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({ encounterId, encounter: identity })

    const pushed = await pushCombatSessionMutationAction({
      encounterId,
      envelope: {
        ...identity,
        mutationId: 1,
        invocation: writeEncounterInline({
          participantId: inlineParticipantId,
          write: damage(6),
        }),
      },
    })
    expect(pushed).toEqual(ok({ version: 1 }))

    const after = await loadCombatAcceptedAction({
      encounterId,
      encounter: identity,
    })
    expect(after.ok).toBe(true)
    if (!after.ok) return
    const tuple = after.value.encounter!
    expect(tuple.cursor).toBe(1)
    expect(tuple.through).toBe(1)
    const goblin = tuple.value.session.participants.find(
      (participant) => participant.id === inlineParticipantId
    )
    expect(
      goblin?.entity.storage === "inline"
        ? goblin.entity.entity.components.vitals?.damage
        : undefined
    ).toBe(6)
  })
})

/**
 * The two preconditions a combat write is licensed by that live on the
 * ENCOUNTER row, not the row each door locks by default. Both were checked
 * outside the committing transaction before the UNN-646 review — liveness not
 * at all, roster membership as an advisory pre-read — which meant a delivery
 * could commit after its license had already been revoked. Rebase cannot undo
 * an authority commit, so these have to be enforced where the lock is held.
 */
describe("combat replica encounter preconditions", () => {
  it("bootstrap serves a draft Encounter root but admits no durable roots", async () => {
    const { encounterId, pcEntityId } = await createFixture()
    await getDb()
      .update(encounters)
      .set({ status: "draft" })
      .where(eq(encounters.id, encounterId))
    const encounterIdentity = {
      clientGroupId: `encounter:${encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    const durableIdentity = {
      clientGroupId: `combat-entity:${pcEntityId}`,
      clientId: `tab-${randomUUID()}`,
    }

    const accepted = await loadCombatAcceptedAction({
      encounterId,
      encounter: encounterIdentity,
      durable: [{ entityId: pcEntityId, identity: durableIdentity }],
    })

    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.value.encounter?.value.status).toBe("draft")
    expect(accepted.value.durable).toEqual({})
    const durableRows = await getDb()
      .select({ clientId: replicaClient.clientId })
      .from(replicaClient)
      .where(eq(replicaClient.clientId, durableIdentity.clientId))
    expect(durableRows).toHaveLength(0)
  })

  it("records an accepted desired no-op without version bump or ping", async () => {
    const { encounterId, inlineParticipantId } = await createFixture()
    const identity = {
      clientGroupId: `encounter:${encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({ encounterId, encounter: identity })
    const before = await encounterVersion(encounterId)

    const result = await pushCombatSessionMutationAction({
      encounterId,
      envelope: {
        ...identity,
        mutationId: 1,
        invocation: setEncounterParticipantSide({
          participantId: inlineParticipantId,
          side: "enemies",
        }),
      },
    })

    expect(result).toEqual(ok({ version: before }))
    expect(await encounterVersion(encounterId)).toBe(before)
    const accepted = await loadCombatAcceptedAction({
      encounterId,
      encounter: identity,
    })
    expect(accepted.ok && accepted.value.encounter?.through).toBe(1)
    const { publishEncounterPing } = await import("@/lib/realtime/publish")
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })

  it("deduplicates an additive delivery exactly and records turn-frame refusal", async () => {
    const { encounterId, inlineParticipantId } = await createFixture()
    const identity = {
      clientGroupId: `encounter:${encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({ encounterId, encounter: identity })
    const envelope = {
      ...identity,
      mutationId: 1,
      invocation: adjustEncounterCounter({
        participantId: inlineParticipantId,
        counter: "lumina" as const,
        delta: 1,
      }),
    }
    expect(
      await pushCombatSessionMutationAction({ encounterId, envelope })
    ).toEqual(ok({ version: 1 }))
    expect(
      await pushCombatSessionMutationAction({ encounterId, envelope })
    ).toEqual(ok({ version: 1 }))

    const refused = await pushCombatSessionMutationAction({
      encounterId,
      envelope: {
        ...identity,
        mutationId: 2,
        invocation: endEncounterTurn({
          expected: {
            round: 1,
            currentActorId: inlineParticipantId,
            actorId: inlineParticipantId,
            turnsTakenThisRound: 0,
          },
        }),
      },
    })
    expect(refused).toEqual(
      err({ kind: "rejected", error: "turn-frame-changed" })
    )
  })

  it("session door: refuses a write against an encounter that has ended", async () => {
    const { encounterId, inlineParticipantId } = await createFixture()
    const identity = {
      clientGroupId: `encounter:${encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({ encounterId, encounter: identity })
    const versionBefore = await encounterVersion(encounterId)

    // End Combat wins the race and commits its sweep plus the status flip.
    await getDb()
      .update(encounters)
      .set({ status: "ended" })
      .where(eq(encounters.id, encounterId))

    const result = await pushCombatSessionMutationAction({
      encounterId,
      envelope: {
        ...identity,
        mutationId: 1,
        invocation: writeEncounterInline({
          participantId: inlineParticipantId,
          write: damage(4),
        }),
      },
    })

    expect(result).toEqual(
      err({ kind: "rejected", error: "encounter-not-live" })
    )
    // The historical session must be exactly what the end sweep left.
    expect(await encounterVersion(encounterId)).toBe(versionBefore)
  })

  it("durable door: refuses a write for an entity removed from the roster", async () => {
    const { encounterId, pcEntityId } = await createFixture()
    const identity = {
      clientGroupId: `combat-entity:${pcEntityId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({
      encounterId,
      durable: [{ entityId: pcEntityId, identity }],
    })
    const before = await vitalsVersion(pcEntityId)

    // Another transaction removes the PC from the encounter.
    const [row] = await getDb()
      .select({ session: encounters.session })
      .from(encounters)
      .where(eq(encounters.id, encounterId))
    const parsed = storedSessionSchema.parse(row!.session)
    await getDb()
      .update(encounters)
      .set({
        session: {
          ...parsed,
          participants: parsed.participants.filter(
            (participant) => participant.locator.storage !== "durable"
          ),
        },
      })
      .where(eq(encounters.id, encounterId))

    const result = await pushCombatDurableMutationAction({
      encounterId,
      entityId: pcEntityId,
      envelope: {
        ...identity,
        mutationId: 1,
        invocation: writeCombatEntity(damage(3)),
      },
    })

    expect(result).toEqual(
      err({ kind: "rejected", error: "participant-not-found" })
    )
    // The character row is untouched: the refusal happened before the entity
    // lock, under the encounter's.
    expect(await vitalsVersion(pcEntityId)).toBe(before)
  })

  it("durable door: refuses a write once the encounter has ended", async () => {
    const { encounterId, pcEntityId } = await createFixture()
    const identity = {
      clientGroupId: `combat-entity:${pcEntityId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({
      encounterId,
      durable: [{ entityId: pcEntityId, identity }],
    })
    const before = await vitalsVersion(pcEntityId)

    await getDb()
      .update(encounters)
      .set({ status: "ended" })
      .where(eq(encounters.id, encounterId))

    const result = await pushCombatDurableMutationAction({
      encounterId,
      entityId: pcEntityId,
      envelope: {
        ...identity,
        mutationId: 1,
        invocation: writeCombatEntity(damage(3)),
      },
    })

    expect(result).toEqual(
      err({ kind: "rejected", error: "encounter-not-live" })
    )
    expect(await vitalsVersion(pcEntityId)).toBe(before)
  })

  it("bootstrap door: mints no identity for a non-live encounter", async () => {
    const { encounterId, pcEntityId } = await createFixture()
    await getDb()
      .update(encounters)
      .set({ status: "ended" })
      .where(eq(encounters.id, encounterId))

    const identity = {
      clientGroupId: `combat-entity:${pcEntityId}`,
      clientId: `tab-${randomUUID()}`,
    }
    const result = await loadCombatAcceptedAction({
      encounterId,
      encounter: {
        clientGroupId: `encounter:${encounterId}`,
        clientId: `tab-${randomUUID()}`,
      },
      durable: [{ entityId: pcEntityId, identity }],
    })

    expect(result).toEqual(err("encounter-not-live"))
    // Registration is the license the push doors' absent-row ⇒
    // `unknown-client` invariant leans on; a stale tab must not acquire one.
    const rows = await getDb()
      .select({ clientId: replicaClient.clientId })
      .from(replicaClient)
      .where(eq(replicaClient.clientId, identity.clientId))
    expect(rows).toHaveLength(0)
  })
})
