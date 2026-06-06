import { randomUUID } from "node:crypto"
import { eq, inArray } from "drizzle-orm"

import {
  createCombatSession,
  type CombatantSetup,
} from "@workspace/game/encounter"

import {
  makeSeedCharacter,
  type SeedCharacter,
} from "@/lib/__fixtures__/seed-characters"
import { campaigns, characters, encounters, getDb } from "@/lib/db"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import { insertCharacter } from "@/lib/db/seed-character"

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
}

export function createTracker(): CleanupTracker {
  return { campaignIds: [], characterIds: [], encounterIds: [] }
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

/** Sets (or clears, with `null`) a character's campaign placement. */
export async function placeCharacter(
  characterId: string,
  campaignId: string | null
): Promise<void> {
  await getDb()
    .update(characters)
    .set({ campaignId })
    .where(eq(characters.id, characterId))
}

export interface TestEncounter {
  id: string
  shortId: string
  url: string
}

/**
 * Mints an encounter (default `live`) in `campaignId`, optionally seeding PC
 * combatants on the players' side — the live-lock guards key off a live
 * encounter that lists a placed character as a combatant.
 */
export async function createLiveEncounter(
  tracker: CleanupTracker,
  opts: {
    campaignId: string
    combatantCharacterIds?: string[]
    status?: EncounterStatus
  }
): Promise<TestEncounter> {
  const suffix = uniqueSuffix()
  const id = `e2e-encounter-${suffix}`
  const setups: CombatantSetup[] = (opts.combatantCharacterIds ?? []).map(
    (characterId) => ({
      side: "players",
      ref: { kind: "pc", characterId },
      zoneId: "",
    })
  )
  let n = 0
  await getDb()
    .insert(encounters)
    .values({
      id,
      shortId: id,
      campaignId: opts.campaignId,
      name: "E2E encounter",
      status: opts.status ?? "live",
      session: createCombatSession(setups, () => `${id}-c${n++}`),
      version: 0,
    })
  tracker.encounterIds.push(id)
  return { id, shortId: id, url: `/combat/${id}` }
}

/**
 * Deletes everything the tracker minted, FK-safe (encounters → characters →
 * campaigns; deleting a character cascades its child rows). Idempotent: rows a
 * test already removed are simply absent. Call once in `afterAll`.
 */
export async function cleanup(tracker: CleanupTracker): Promise<void> {
  const db = getDb()
  if (tracker.encounterIds.length > 0) {
    await db
      .delete(encounters)
      .where(inArray(encounters.id, tracker.encounterIds))
  }
  if (tracker.characterIds.length > 0) {
    await db
      .delete(characters)
      .where(inArray(characters.id, tracker.characterIds))
  }
  if (tracker.campaignIds.length > 0) {
    await db.delete(campaigns).where(inArray(campaigns.id, tracker.campaignIds))
  }
  tracker.encounterIds.length = 0
  tracker.characterIds.length = 0
  tracker.campaignIds.length = 0
}
