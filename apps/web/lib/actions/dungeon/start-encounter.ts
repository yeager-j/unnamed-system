"use server"

import {
  comintMapInstance,
  createReduceSession,
  isRosterFullyPlaced,
  saveSession,
  type ParticipantSetup,
  type StoredEntityLocator,
} from "@workspace/game-v2/encounter"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok, type Result } from "@workspace/result"

import { createSession, instantiateEnemy } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { loadLiveEncounterIdForCampaign } from "@/lib/db/queries/load-encounter-session"
import { loadLiveEntityRowById } from "@/lib/db/queries/load-entity"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import {
  lockDungeonRowForLifecycle,
  touchDungeonLifecycle,
} from "@/lib/db/writes/dungeon"
import { createEncounter } from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import {
  publishDungeonInstancePing,
  publishDungeonPing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import { revalidateDungeon } from "./revalidate"
import {
  StartDungeonEncounterSchema,
  type StartDungeonEncounterError,
  type StartDungeonEncounterInput,
} from "./start-encounter.schema"

/**
 * Begin combat on a delve (UNN-536, PR11c) — mint an already-`live` v2 encounter
 * on the delve's **own** Map Instance (no copy, no carved sub-graph), atomically
 * via {@link guardMany}, and return the new encounter's `shortId`.
 *
 * The roster is minted in one shot (the delve has no persisted draft — combatants
 * are staged client-side and committed here): each party PC becomes a **durable**
 * participant and each staged enemy an **inline** catalog instance. The one
 * load-bearing divergence from the mapless mint is the PC participant id:
 * `id === characterId`, so the PC's **exploration** occupancy token (already on
 * the Instance, keyed by `characterId`) **is** its combat token — the co-mint
 * re-lays it in place (SD5: the token key is a `characterId` in exploration, a
 * `ParticipantId` in combat; making them equal is what keeps the party where it
 * stands). Only staged enemies get **new** tokens, folded onto the existing
 * geometry via {@link comintMapInstance}'s `base` arm.
 *
 * Guards: `requireCampaignDM`; the delve must be `active`; one-live-encounter-
 * per-campaign; and the authoritative {@link isRosterFullyPlaced} check over the
 * co-minted Instance.
 */
export async function startDungeonEncounterAction(
  input: StartDungeonEncounterInput
): Promise<Result<{ shortId: string }, StartDungeonEncounterError>> {
  const parsed = StartDungeonEncounterSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const {
    dungeonId,
    expectedVersion,
    expectedInstanceVersion,
    name,
    advantage,
    firstSide,
    partyCharacterIds,
    enemies,
  } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  if (dungeon.status !== "active") return err("delve-not-active")

  const liveId = await loadLiveEncounterIdForCampaign(dungeon.campaignId)
  if (liveId !== null) return err("campaign-already-has-live-encounter")

  const instance = await loadMapInstanceById(dungeon.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const setups: ParticipantSetup[] = []
  const locators = new Map<ParticipantId, StoredEntityLocator>()

  // Party PCs — durable participants whose id === entityId (= characterId under
  // the shared-id convention), so the delve token doubles as the combat token (no
  // re-placement needed). A party PC with no `entity` row can't fight (the S0
  // degraded window — only entity-row PCs are combat-capable).
  for (const characterId of partyCharacterIds) {
    // Live-only (R1 — UNN-571): a soft-deleted party PC can't be hydrated into a
    // fresh delve fight from a stale setup — it reads as `character-not-found`.
    const row = await loadLiveEntityRowById(characterId)
    if (row === null) return err("character-not-found")
    const loaded = loadEntityRow(row)
    if (!loaded.ok) return err("character-not-found")
    const participantId = asParticipantId(characterId)
    setups.push({
      id: participantId,
      side: "players",
      source: { entity: loaded.value },
    })
    locators.set(participantId, { storage: "durable", entityId: characterId })
  }

  // Staged enemies — fresh inline catalog instances, placed on their staged zone.
  const placement: Record<ParticipantId, string> = {}
  for (const { enemyKey, zoneId, count } of enemies) {
    for (let copy = 0; copy < count; copy++) {
      const participantId = asParticipantId(newId())
      const entity = instantiateEnemy(enemyKey, participantId)
      if (entity === undefined) return err("unknown-enemy")
      setups.push({
        id: participantId,
        side: "enemies",
        source: { entity },
      })
      locators.set(participantId, {
        storage: "inline",
        entity: { id: entity.id, components: entity.components },
      })
      placement[participantId] = zoneId
    }
  }

  const session = createReduceSession(newId)(createSession(setups, newId), {
    kind: "startCombat",
    advantage,
    firstSide,
  })

  // Co-mint enemy tokens onto the delve's existing geometry; PC tokens (absent
  // from `placement`) survive from `base` exactly where exploration left them.
  const nextInstance = comintMapInstance(session, placement, instance.state)
  if (!isRosterFullyPlaced(session, nextInstance)) {
    return err("encounter-has-unplaced-combatants")
  }

  const stored = saveSession(session, locators)
  if (!stored.ok) return err("locator-missing")

  // Combat start is a lifecycle action (D11, UNN-589): the transaction opens
  // with the dungeon-row lock (dungeon-first per the lock-order discipline) and
  // re-establishes the friendly pre-checks on the locked row — the status read
  // and the live-encounter read above stay for error copy, but the ones that
  // count happen after the lock, where no competing lifecycle action (a racing
  // finish, a second combat start) can commit under them.
  const result = await guardMany<
    { shortId: string; instanceVersion: number; version: number },
    StartDungeonEncounterError
  >(async (tx: WriteExecutor) => {
    const locked = await lockDungeonRowForLifecycle(
      tx,
      dungeon.id,
      expectedVersion
    )
    if (!locked.ok) return locked
    if (locked.value.status !== "active") return err("delve-not-active")

    const liveInTx = await loadLiveEncounterIdForCampaign(
      dungeon.campaignId,
      tx
    )
    if (liveInTx !== null) return err("campaign-already-has-live-encounter")

    const inst = await saveMapInstanceState(
      tx,
      dungeon.mapInstanceId,
      nextInstance,
      expectedInstanceVersion
    )
    if (!inst.ok) return inst

    const created = await createEncounter(
      {
        campaignId: dungeon.campaignId,
        name,
        session: stored.value,
        mapInstanceId: dungeon.mapInstanceId,
        status: "live",
      },
      tx
    )

    // Combat start changes no dungeon column, but the version bump is what
    // makes it visible to every other lifecycle actor's guard — a finish racing
    // this start conflicts on the dungeon version instead of folding over a
    // live encounter it never saw.
    const touched = await touchDungeonLifecycle(tx, dungeon.id, expectedVersion)
    if (!touched.ok) return touched

    return ok({
      shortId: created.shortId,
      instanceVersion: inst.value.version,
      version: touched.value.version,
    })
  })
  if (!result.ok) return result

  publishEncounterPing(result.value.shortId, { version: 0, status: "live" })
  publishDungeonInstancePing(dungeon.shortId, result.value.instanceVersion)
  publishDungeonPing(dungeon.shortId, {
    version: result.value.version,
    status: dungeon.status,
  })
  revalidateDungeon(dungeon)
  return ok({ shortId: result.value.shortId })
}

/** Server-side id mint — one fresh id per staged enemy copy + the reducer. */
const newId = () => crypto.randomUUID()
