import { randomUUID } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  defaultOverlay,
  storedSessionSchema,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  createDungeonState,
  emptyMapInstance,
} from "@workspace/game-v2/spatial"
import { ok } from "@workspace/result"

import { writeEncounterInline } from "@/domain/combat/replica/mutations"
import { instantiateEnemy } from "@/domain/game-engine-v2"
import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { endCombatAction } from "@/lib/actions/combat/end-combat"
import { pushCombatSessionMutationAction } from "@/lib/actions/combat/replica/push"
import { loadCombatAcceptedAction } from "@/lib/actions/combat/replica/snapshot"
import {
  addParticipantAction,
  removeParticipantAction,
} from "@/lib/actions/combat/roster"
import { startCombatAction } from "@/lib/actions/combat/start-combat"
import { endDungeonCombatAction } from "@/lib/actions/dungeon/end-combat"
import { getDb } from "@/lib/db/client"
import { campaigns } from "@/lib/db/schema/campaign"
import { dungeons } from "@/lib/db/schema/dungeon"
import { encounters } from "@/lib/db/schema/encounter"
import { entity } from "@/lib/db/schema/entity"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { playerCharacter } from "@/lib/db/schema/player-character"
import { insertSeedEntity } from "@/lib/db/seed-entity"

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

vi.mock("@/lib/actions/encounter/revalidate", () => ({
  revalidateEncounter: vi.fn(),
}))
vi.mock("@/lib/actions/dungeon/revalidate", () => ({
  revalidateDungeon: vi.fn(),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: vi.fn(),
  publishEncounterPing: vi.fn(),
  publishEncounterInstancePing: vi.fn(),
  publishDungeonPing: vi.fn(),
  publishDungeonInstancePing: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

if (!process.env.DATABASE_URL) {
  throw new Error(
    "test:replica-db requires DATABASE_URL for an isolated migrated Postgres database"
  )
}

const OWNER_ID = "dev-user-claude"

const entityIds: string[] = []
const encounterIds: string[] = []
const campaignIds: string[] = []
const instanceIds: string[] = []
const dungeonIds: string[] = []

interface CommandFixture {
  campaignId: string
  encounterId: string
  instanceId: string
  pcEntityId: string
  pcParticipantId: ReturnType<typeof asParticipantId>
  inlineParticipantId: ReturnType<typeof asParticipantId>
}

/** A campaign + one placed PC (durable participant) + one inline enemy —
 *  the smallest world every surviving command writes. */
async function createFixture(
  status: "draft" | "live" = "live"
): Promise<CommandFixture> {
  const suffix = randomUUID().slice(0, 8)
  const db = getDb()

  const campaignId = `cmd-camp-${suffix}`
  await db.insert(campaigns).values({
    id: campaignId,
    shortId: `cmd-camp-${suffix}`,
    joinToken: `cmd-join-${suffix}`,
    dmUserId: OWNER_ID,
    name: `Command ${suffix}`,
  })
  campaignIds.push(campaignId)

  const seed = makeSeedCharacter({
    slug: `cmd-law-${suffix}`,
    shortId: `cmd-law-${suffix}`,
    name: `Command Law ${suffix}`,
  })
  const pcEntityId = await insertSeedEntity(seed, OWNER_ID, campaignId)
  entityIds.push(pcEntityId)

  const instanceId = `cmd-mi-${suffix}`
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

  const encounterId = `cmd-enc-${suffix}`
  await db.insert(encounters).values({
    id: encounterId,
    shortId: `cmd-enc-${suffix}`,
    campaignId,
    name: `Command ${suffix}`,
    status,
    session,
    mapInstanceId: instanceId,
    version: 0,
  })
  encounterIds.push(encounterId)

  return {
    campaignId,
    encounterId,
    instanceId,
    pcEntityId,
    pcParticipantId,
    inlineParticipantId,
  }
}

async function createDungeonRow(fixture: CommandFixture, turnCounter = 4) {
  const suffix = randomUUID().slice(0, 8)
  const dungeonId = `cmd-dng-${suffix}`
  await getDb()
    .insert(dungeons)
    .values({
      id: dungeonId,
      shortId: dungeonId,
      campaignId: fixture.campaignId,
      mapInstanceId: fixture.instanceId,
      name: `Delve ${suffix}`,
      status: "active",
      state: { ...createDungeonState(), turnCounter },
      version: 1,
    })
  dungeonIds.push(dungeonId)
  return dungeonId
}

async function encounterRow(encounterId: string) {
  const [row] = await getDb()
    .select()
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)
  if (!row) throw new Error(`encounter ${encounterId} vanished`)
  return row
}

async function instanceRow(instanceId: string) {
  const [row] = await getDb()
    .select()
    .from(mapInstances)
    .where(eq(mapInstances.id, instanceId))
    .limit(1)
  if (!row) throw new Error(`instance ${instanceId} vanished`)
  return row
}

async function dungeonRow(dungeonId: string) {
  const [row] = await getDb()
    .select()
    .from(dungeons)
    .where(eq(dungeons.id, dungeonId))
    .limit(1)
  if (!row) throw new Error(`dungeon ${dungeonId} vanished`)
  return row
}

function participantIds(session: unknown): string[] {
  return storedSessionSchema
    .parse(session)
    .participants.map((participant) => participant.id)
}

afterAll(async () => {
  const db = getDb()
  if (dungeonIds.length > 0)
    await db.delete(dungeons).where(inArray(dungeons.id, dungeonIds))
  if (encounterIds.length > 0)
    await db.delete(encounters).where(inArray(encounters.id, encounterIds))
  if (instanceIds.length > 0)
    await db.delete(mapInstances).where(inArray(mapInstances.id, instanceIds))
  if (entityIds.length > 0) {
    await db
      .delete(playerCharacter)
      .where(inArray(playerCharacter.entityId, entityIds))
    await db.delete(entity).where(inArray(entity.id, entityIds))
  }
  if (campaignIds.length > 0)
    await db.delete(campaigns).where(inArray(campaigns.id, campaignIds))
})

describe("startCombatAction — locked draft→live lifecycle", () => {
  it("flips draft to live under the locks and is desired-state idempotent on redelivery", async () => {
    const fixture = await createFixture("draft")

    const first = await startCombatAction({
      encounterId: fixture.encounterId,
      advantage: "players",
      firstSide: "players",
    })
    expect(first.ok).toBe(true)
    const afterFirst = await encounterRow(fixture.encounterId)
    expect(afterFirst.status).toBe("live")

    const second = await startCombatAction({
      encounterId: fixture.encounterId,
      advantage: "enemies",
      firstSide: "enemies",
    })
    expect(second).toEqual(ok({ version: afterFirst.version }))
    const afterSecond = await encounterRow(fixture.encounterId)
    // No re-reduce: version unchanged, the first start's advantage stands.
    expect(afterSecond.version).toBe(afterFirst.version)
    expect(storedSessionSchema.parse(afterSecond.session).advantage).toBe(
      "players"
    )
  })

  it("re-checks single-live-per-campaign inside the transaction", async () => {
    const live = await createFixture("live")
    const suffix = randomUUID().slice(0, 8)
    const db = getDb()
    const instanceId = `cmd-mi2-${suffix}`
    await db
      .insert(mapInstances)
      .values({ id: instanceId, state: emptyMapInstance(), version: 0 })
    instanceIds.push(instanceId)
    const draftId = `cmd-enc2-${suffix}`
    await db.insert(encounters).values({
      id: draftId,
      shortId: draftId,
      campaignId: live.campaignId,
      name: `Second ${suffix}`,
      status: "draft",
      session: storedSessionSchema.parse({
        round: 1,
        currentActorId: null,
        advantage: null,
        firstSide: null,
        participants: [],
      }),
      mapInstanceId: instanceId,
      version: 0,
    })
    encounterIds.push(draftId)

    const result = await startCombatAction({
      encounterId: draftId,
      advantage: "neutral",
      firstSide: "players",
    })
    expect(result).toEqual({
      ok: false,
      error: "campaign-already-has-live-encounter",
    })
    expect((await encounterRow(draftId)).status).toBe("draft")
  })
})

describe("roster commands — natural idempotency by client-minted id", () => {
  it("a duplicate durable add converges to one roster row with no second bump", async () => {
    const fixture = await createFixture("live")
    const joinerId = asParticipantId(`p-join-${randomUUID().slice(0, 8)}`)
    const input = {
      encounterId: fixture.encounterId,
      setup: {
        id: joinerId,
        side: "players" as const,
        entityId: fixture.pcEntityId,
      },
    }

    const first = await addParticipantAction(input)
    expect(first.ok).toBe(true)
    const afterFirst = await encounterRow(fixture.encounterId)
    const second = await addParticipantAction(input)
    expect(second).toEqual(ok({ version: afterFirst.version }))

    const after = await encounterRow(fixture.encounterId)
    expect(after.version).toBe(afterFirst.version)
    expect(
      participantIds(after.session).filter((id) => id === joinerId)
    ).toHaveLength(1)
  })

  it("remove severs the roster row and its occupancy atomically; an absent id no-ops", async () => {
    const fixture = await createFixture("live")

    const removed = await removeParticipantAction({
      encounterId: fixture.encounterId,
      participantId: fixture.inlineParticipantId,
    })
    expect(removed.ok).toBe(true)
    const afterRemove = await encounterRow(fixture.encounterId)
    expect(participantIds(afterRemove.session)).not.toContain(
      fixture.inlineParticipantId
    )

    const replay = await removeParticipantAction({
      encounterId: fixture.encounterId,
      participantId: fixture.inlineParticipantId,
    })
    expect(replay).toEqual(ok({ version: afterRemove.version }))
    expect((await encounterRow(fixture.encounterId)).version).toBe(
      afterRemove.version
    )
  })
})

describe("endCombatAction — terminal desired state", () => {
  it("ends, freezes, and prunes atomically; a redelivered end reports current versions without re-sweeping", async () => {
    const fixture = await createFixture("live")

    const first = await endCombatAction({ encounterId: fixture.encounterId })
    expect(first.ok).toBe(true)
    const ended = await encounterRow(fixture.encounterId)
    const frozen = await instanceRow(fixture.instanceId)
    expect(ended.status).toBe("ended")
    expect(frozen.status).toBe("frozen")

    const replay = await endCombatAction({ encounterId: fixture.encounterId })
    expect(replay).toEqual(
      ok({ version: ended.version, instanceVersion: frozen.version })
    )
    expect((await encounterRow(fixture.encounterId)).version).toBe(
      ended.version
    )
  })
})

describe("endDungeonCombatAction — three-row atomicity", () => {
  it("commits encounter + instance + dungeon together and never advances the turn twice", async () => {
    const fixture = await createFixture("live")
    const dungeonId = await createDungeonRow(fixture, 4)

    const first = await endDungeonCombatAction({
      encounterId: fixture.encounterId,
      dungeonId,
    })
    expect(first.ok).toBe(true)
    const ended = await encounterRow(fixture.encounterId)
    const afterDungeon = await dungeonRow(dungeonId)
    expect(ended.status).toBe("ended")
    expect(afterDungeon.state.turnCounter).toBe(5)

    const replay = await endDungeonCombatAction({
      encounterId: fixture.encounterId,
      dungeonId,
    })
    expect(replay.ok).toBe(true)
    // The subtle idempotency case: the turn must not advance a second time.
    expect((await dungeonRow(dungeonId)).state.turnCounter).toBe(5)
    expect((await dungeonRow(dungeonId)).version).toBe(afterDungeon.version)
  })

  it("a failed precondition commits nothing across any of the three rows", async () => {
    const fixture = await createFixture("live")
    const other = await createFixture("live")
    // The dungeon's instance is NOT the encounter's — the membership
    // precondition must roll everything back.
    const dungeonId = await createDungeonRow(other, 4)

    const result = await endDungeonCombatAction({
      encounterId: fixture.encounterId,
      dungeonId,
    })
    expect(result).toEqual({ ok: false, error: "encounter-not-on-dungeon" })
    expect((await encounterRow(fixture.encounterId)).status).toBe("live")
    expect((await dungeonRow(dungeonId)).state.turnCounter).toBe(4)
    expect((await instanceRow(fixture.instanceId)).version).toBe(0)
  })
})

describe("command-vs-replica coexistence on the encounter row", () => {
  it("a session mutation delivered after end combat records a lifecycle refusal, never a write", async () => {
    const fixture = await createFixture("live")
    const identity = {
      clientGroupId: `encounter:${fixture.encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({
      encounterId: fixture.encounterId,
      encounter: identity,
    })

    const endResult = await endCombatAction({
      encounterId: fixture.encounterId,
    })
    expect(endResult.ok).toBe(true)
    const afterEnd = await encounterRow(fixture.encounterId)

    const push = await pushCombatSessionMutationAction({
      encounterId: fixture.encounterId,
      envelope: {
        ...identity,
        mutationId: 1,
        invocation: writeEncounterInline({
          participantId: fixture.inlineParticipantId,
          write: { component: "vitals", op: "damage", amount: 2 },
        }),
      },
    })
    expect(push).toEqual({
      ok: false,
      error: { kind: "rejected", error: "encounter-not-live" },
    })
    expect((await encounterRow(fixture.encounterId)).version).toBe(
      afterEnd.version
    )
  })

  it("a concurrent burst of push + roster remove + end combat serializes without deadlock", async () => {
    const fixture = await createFixture("live")
    const identity = {
      clientGroupId: `encounter:${fixture.encounterId}`,
      clientId: `tab-${randomUUID()}`,
    }
    await loadCombatAcceptedAction({
      encounterId: fixture.encounterId,
      encounter: identity,
    })

    const outcomes = await Promise.all([
      pushCombatSessionMutationAction({
        encounterId: fixture.encounterId,
        envelope: {
          ...identity,
          mutationId: 1,
          invocation: writeEncounterInline({
            participantId: fixture.inlineParticipantId,
            write: { component: "vitals", op: "damage", amount: 1 },
          }),
        },
      }),
      removeParticipantAction({
        encounterId: fixture.encounterId,
        participantId: fixture.inlineParticipantId,
      }),
      endCombatAction({ encounterId: fixture.encounterId }),
    ])

    // Whatever serial order the locks produced, every delivery terminated
    // (no deadlock, no throw) and the row landed terminal.
    expect(outcomes).toHaveLength(3)
    expect((await encounterRow(fixture.encounterId)).status).toBe("ended")
    expect((await instanceRow(fixture.instanceId)).status).toBe("frozen")
  })
})
