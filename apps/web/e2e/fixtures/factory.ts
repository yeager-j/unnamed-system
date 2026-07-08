import { randomUUID } from "node:crypto"
import { eq, inArray } from "drizzle-orm"

import {
  defaultOverlay,
  storedSessionSchema,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  createDungeonState,
  emptyMapInstance,
  mapGeometrySchema,
  type MapGeometry,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"

import {
  makeSeedCharacter,
  type SeedCharacter,
} from "@/lib/__fixtures__/seed-characters"
import {
  campaigns,
  characters,
  dungeons,
  encounters,
  entity,
  getDb,
  mapInstances,
  maps,
} from "@/lib/db"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import { insertCharacter } from "@/lib/db/seed-character"
import { insertSeedEntity } from "@/lib/db/seed-entity"

/**
 * Ephemeral E2E test-data factory (UNN-343). Write-path specs mint exactly the
 * characters / campaigns / encounters they need with **unique-per-run ids**, so
 * `fullyParallel` workers never contend, then delete them in one `afterAll`
 * `cleanup(tracker)` — leaving zero permanent seed footprint. Contrast the
 * seed (`lib/db/seed.ts`), which now carries only read-only showcase/demo data.
 *
 * Each creator registers its row in the {@link CleanupTracker} the spec owns;
 * `cleanup` deletes FK-safe (encounters → characters → campaigns) and tolerates
 * rows a test already removed (e.g. `delete-character`'s happy path), so it is
 * correct even when a test fails partway.
 */

const DEV_USER_ID = "dev-user-claude"

export interface CleanupTracker {
  campaignIds: string[]
  characterIds: string[]
  encounterIds: string[]
  dungeonIds: string[]
  mapInstanceIds: string[]
  mapIds: string[]
}

export function createTracker(): CleanupTracker {
  return {
    campaignIds: [],
    characterIds: [],
    encounterIds: [],
    dungeonIds: [],
    mapInstanceIds: [],
    mapIds: [],
  }
}

/** A short, collision-resistant suffix that keeps ids unique across parallel
 *  workers and across leftover rows from a prior interrupted run. */
function uniqueSuffix(): string {
  return randomUUID().slice(0, 8)
}

export interface TestCharacter {
  /** DB row id (`seed-char-${slug}`) for direct pokes. */
  id: string
  /** Unique-per-run slug — feeds `archetypeId(slug, key)` for child-row pokes. */
  slug: string
  shortId: string
  /** `/c/${shortId}` — a `page.goto(...)` target. */
  url: string
  /** Suffixed display name; unique so a "find card by name" on `/` is exact. */
  name: string
}

/**
 * Mints a finalized character owned by the dev user (override `ownerId` for a
 * different owner). Pass the same `makeSeedCharacter` overrides the spec needs
 * (archetype ranks, mechanic state, items, …); `slug`/`shortId` are generated
 * unique and `name` is suffixed for grid disambiguation.
 */
export async function createTestCharacter(
  tracker: CleanupTracker,
  overrides: Partial<Omit<SeedCharacter, "slug" | "shortId">> & {
    ownerId?: string
  } = {}
): Promise<TestCharacter> {
  const { ownerId = DEV_USER_ID, name = "Test Character", ...rest } = overrides
  const suffix = uniqueSuffix()
  const slug = `e2e-${suffix}`
  const character = makeSeedCharacter({
    ...rest,
    slug,
    shortId: slug,
    name: `${name} ${suffix}`,
  })
  const id = await insertCharacter(character, ownerId)
  // Dual-mint the v2 `entity` row (shared id, unplaced — UNN-551) so a factory
  // character can be a durable combatant; `placeCharacter` sets its campaignId.
  await insertSeedEntity(character, ownerId, null)
  tracker.characterIds.push(id)
  return {
    id,
    slug,
    shortId: character.shortId,
    url: `/c/${character.shortId}`,
    name: character.name,
  }
}

export interface TestCampaign {
  id: string
  shortId: string
  joinToken: string
  name: string
}

/** Mints a campaign DM'd by `dmUserId` with unique id / shortId / joinToken. */
export async function createTestCampaign(
  tracker: CleanupTracker,
  opts: { dmUserId: string; name?: string }
): Promise<TestCampaign> {
  const suffix = uniqueSuffix()
  const row = {
    id: `e2e-campaign-${suffix}`,
    shortId: `e2e-campaign-${suffix}`,
    joinToken: `e2e-join-${suffix}`,
    dmUserId: opts.dmUserId,
    name: opts.name ?? `E2E Campaign ${suffix}`,
  }
  await getDb().insert(campaigns).values(row)
  tracker.campaignIds.push(row.id)
  return {
    id: row.id,
    shortId: row.shortId,
    joinToken: row.joinToken,
    name: row.name,
  }
}

/** Sets (or clears, with `null`) a character's campaign placement — on **both**
 *  the v1 `characters` row (old sheet) and its shared-id `entity` row (UNN-551),
 *  so the durable write path's `requireOwnerOrCampaignDMForEntity` and the
 *  encounter-lock (which read `entity.campaignId`) admit the placed combatant. */
export async function placeCharacter(
  characterId: string,
  campaignId: string | null
): Promise<void> {
  const db = getDb()
  await db
    .update(characters)
    .set({ campaignId })
    .where(eq(characters.id, characterId))
  await db.update(entity).set({ campaignId }).where(eq(entity.id, characterId))
}

export interface TestMap {
  id: string
  shortId: string
  url: string
  name: string
}

/** Mints a user-owned Map template (UNN-460) with unique id / shortId. Geometry
 *  defaults empty; pass one to seed authored zones/connections. */
export async function createTestMap(
  tracker: CleanupTracker,
  opts: { userId?: string; name?: string; geometry?: MapGeometry } = {}
): Promise<TestMap> {
  const { userId = DEV_USER_ID, name, geometry } = opts
  const suffix = uniqueSuffix()
  const row = {
    id: `e2e-map-${suffix}`,
    shortId: `e2e-map-${suffix}`,
    userId,
    name: name ?? `E2E Map ${suffix}`,
    geometry: geometry ?? mapGeometrySchema.parse({}),
  }
  await getDb().insert(maps).values(row)
  tracker.mapIds.push(row.id)
  return {
    id: row.id,
    shortId: row.shortId,
    url: `/maps/${row.shortId}`,
    name: row.name,
  }
}

/** Mints a standalone Map Instance, optionally back-referencing a Map
 *  (`mapId`) — for the snapshot-isolation / set-null-FK assertions (UNN-460). */
export async function createTestMapInstance(
  tracker: CleanupTracker,
  opts: { mapId?: string | null; state?: MapInstanceState } = {}
): Promise<{ id: string }> {
  const suffix = uniqueSuffix()
  const id = `e2e-mi-${suffix}`
  await getDb()
    .insert(mapInstances)
    .values({
      id,
      mapId: opts.mapId ?? null,
      state: opts.state ?? emptyMapInstance(),
      version: 0,
    })
  tracker.mapInstanceIds.push(id)
  return { id }
}

export interface TestEncounter {
  id: string
  shortId: string
  url: string
  mapInstanceId: string
}

/**
 * A v2 {@link StoredSession} with the given durable PC participants on the
 * players' side (unplaced — no occupancy tokens; UNN-535 add-then-place),
 * self-checked through {@link storedSessionSchema} so a fixture drift from the
 * persisted contract fails the mint, not the page under test. Ids stay the
 * deterministic `${encounterId}-c${index}` shape specs poke by.
 */
export function makeStoredSession(
  encounterId: string,
  combatantCharacterIds: string[]
): StoredSession {
  return storedSessionSchema.parse({
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: combatantCharacterIds.map((characterId, index) => ({
      id: asParticipantId(`${encounterId}-c${index}`),
      locator: { storage: "durable", entityId: characterId },
      overlay: defaultOverlay({ side: "players" }),
    })),
  } satisfies StoredSession)
}

/**
 * Mints an encounter (default `live`) in `campaignId` **plus its Map Instance**
 * (UNN-459 — `encounters.mapInstanceId` is non-null). By default it seeds the
 * given PC `combatantCharacterIds` on the players' side as **durable
 * participants** of a v2 {@link StoredSession} (unplaced, no tokens — the
 * live-lock guards key off a live encounter whose durable locators list a
 * placed character) over an empty Instance. Pass a fully-built `session`
 * **and** `mapInstanceState` when the spec needs a richer spatial shape
 * (zones, placement, a started session — see `move-combatant-target.ts`);
 * both are persisted verbatim and `combatantCharacterIds` is ignored.
 */
export async function createLiveEncounter(
  tracker: CleanupTracker,
  opts: {
    campaignId: string
    combatantCharacterIds?: string[]
    status?: EncounterStatus
    session?: StoredSession
    mapInstanceState?: MapInstanceState
  }
): Promise<TestEncounter> {
  const suffix = uniqueSuffix()
  const id = `e2e-encounter-${suffix}`
  const mapInstanceId = `e2e-mi-${suffix}`
  const db = getDb()
  await db.insert(mapInstances).values({
    id: mapInstanceId,
    state: opts.mapInstanceState ?? emptyMapInstance(),
    version: 0,
  })
  tracker.mapInstanceIds.push(mapInstanceId)

  await db.insert(encounters).values({
    id,
    shortId: id,
    campaignId: opts.campaignId,
    name: "E2E encounter",
    status: opts.status ?? "live",
    session:
      opts.session ?? makeStoredSession(id, opts.combatantCharacterIds ?? []),
    mapInstanceId,
    version: 0,
  })
  tracker.encounterIds.push(id)
  return { id, shortId: id, url: `/combat/${id}`, mapInstanceId }
}

export interface TestDungeon {
  id: string
  shortId: string
  url: string
  watchUrl: string
  mapInstanceId: string
}

/**
 * Mints an **active** dungeon (UNN-536) in `campaignId` **plus its Map Instance**
 * (`dungeons.mapInstanceId` is a `restrict` FK). The `mapInstanceState` carries
 * the delve geometry + the party's exploration occupancy tokens — the baseline the
 * combat cutover layers over. The dungeon `state` starts fresh (turn 0). The DM is
 * `campaign.dmUserId`, so `getDungeonForDM` admits the dev user.
 */
export async function createActiveDungeon(
  tracker: CleanupTracker,
  opts: {
    campaignId: string
    mapInstanceState: MapInstanceState
    name?: string
  }
): Promise<TestDungeon> {
  const suffix = uniqueSuffix()
  const id = `e2e-dungeon-${suffix}`
  const mapInstanceId = `e2e-mi-${suffix}`
  const db = getDb()

  await db.insert(mapInstances).values({
    id: mapInstanceId,
    state: opts.mapInstanceState,
    version: 0,
  })
  tracker.mapInstanceIds.push(mapInstanceId)

  await db.insert(dungeons).values({
    id,
    shortId: id,
    campaignId: opts.campaignId,
    mapInstanceId,
    name: opts.name ?? "E2E delve",
    status: "active",
    state: createDungeonState(),
    version: 0,
  })
  tracker.dungeonIds.push(id)

  return {
    id,
    shortId: id,
    url: `/dungeon/${id}`,
    watchUrl: `/c/dungeon/${id}`,
    mapInstanceId,
  }
}

/**
 * Deletes everything the tracker minted, FK-safe (encounters + dungeons before
 * their Map Instances — the `mapInstanceId` FK is `restrict`, so the Instance
 * can't drop while a referencing row exists; then characters → campaigns,
 * deleting a character cascades its child rows). Idempotent: rows a test already
 * removed are simply absent. Call once in `afterAll`.
 */
export async function cleanup(tracker: CleanupTracker): Promise<void> {
  const db = getDb()
  if (tracker.encounterIds.length > 0) {
    await db
      .delete(encounters)
      .where(inArray(encounters.id, tracker.encounterIds))
  }
  if (tracker.dungeonIds.length > 0) {
    await db.delete(dungeons).where(inArray(dungeons.id, tracker.dungeonIds))
  }
  // App-created encounters on a tracked Instance (a delve fight the spec started
  // through the UI) aren't in `encounterIds`, but their `restrict` FK would block
  // the Instance delete below — sweep them by Instance so cleanup stays FK-safe.
  if (tracker.mapInstanceIds.length > 0) {
    await db
      .delete(encounters)
      .where(inArray(encounters.mapInstanceId, tracker.mapInstanceIds))
  }
  if (tracker.mapInstanceIds.length > 0) {
    await db
      .delete(mapInstances)
      .where(inArray(mapInstances.id, tracker.mapInstanceIds))
  }
  if (tracker.characterIds.length > 0) {
    // The dual-minted `entity` rows share the character ids (UNN-551).
    await db.delete(entity).where(inArray(entity.id, tracker.characterIds))
    await db
      .delete(characters)
      .where(inArray(characters.id, tracker.characterIds))
  }
  if (tracker.campaignIds.length > 0) {
    await db.delete(campaigns).where(inArray(campaigns.id, tracker.campaignIds))
  }
  if (tracker.mapIds.length > 0) {
    await db.delete(maps).where(inArray(maps.id, tracker.mapIds))
  }
  tracker.encounterIds.length = 0
  tracker.dungeonIds.length = 0
  tracker.mapInstanceIds.length = 0
  tracker.characterIds.length = 0
  tracker.campaignIds.length = 0
  tracker.mapIds.length = 0
}
