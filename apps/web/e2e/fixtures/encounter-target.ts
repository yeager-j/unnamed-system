import { and, eq, inArray, notInArray } from "drizzle-orm"

import {
  defaultOverlay,
  overlayComponentsSchema,
  storedSessionSchema,
  type StoredParticipant,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { loadEntity, type Entity } from "@workspace/game-v2/kernel"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import {
  emptyMapInstance,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"

import { instantiateEnemy, resolveEntity } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { encounters, entity, getDb } from "@/lib/db"
import { loadEntityRowById } from "@/lib/db/queries/load-entity"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import { mapInstances } from "@/lib/db/schema/map-instance"
import { encounterConsolePath } from "@/lib/paths"

/**
 * Seed data for the encounter shell + join E2E (`e2e/encounter-shell.spec.ts`,
 * `e2e/join.spec.ts`, UNN-335/298/300/302/327). This is the kept **combat
 * showcase**: it describes **campaigns + their encounters** that read as real
 * demo data, so a dedicated step in `lib/db/seed.ts` seeds it. (Per-spec
 * write-path scaffolding lives in `e2e/fixtures/factory.ts`, not here.)
 *
 * The blobs are v2 {@link StoredSession}s (UNN-535 hard cutover): a PC is a
 * durable locator, an enemy an inline entity — the seeded goblin materializes
 * from the v2 catalog at fixture-build time, exactly as the bestiary commit
 * would. Rosters seed **unplaced** (no occupancy tokens — add-then-place).
 *
 * **Two dev-DM campaigns, by design** (UNN-302's single-live guard):
 *  - **Campaign A** ("Playtest") holds the `draft` + `ended` encounters and the
 *    placed PC. A has *no* live encounter, so its draft can be started (happy
 *    path) and saved/resumed.
 *  - **Campaign B** ("Live") holds the `live` encounter *and* a second `blocked`
 *    draft — starting that draft must be rejected because B already has a live
 *    encounter.
 *
 * Both are owned by the dev user (`dev-user-claude`) — the user local dev and the
 * Playwright auth fixture sign in as — so `requireCampaignDM` admits the test's
 * writes. Their ids must equal `DEV_USER.id` in `lib/db/seed.ts`.
 */
export const ENCOUNTER_DM_USER_ID = "dev-user-claude"

/** A *different* DM (`seed-user`) so the spec can prove the DM-only route 404s
 *  for an encounter that belongs to someone else's campaign. */
export const ENCOUNTER_FOREIGN_DM_USER_ID = "seed-user"

/** The PC placed into Campaign A — the roster source for its draft encounter and
 *  the import-PCs panel (UNN-298). */
const placedPc = makeSeedCharacter({
  slug: "encounter-pc",
  shortId: "encounter-pc",
  name: "Brannis Vael",
})

const PLACED_PC_ID = `seed-char-${placedPc.slug}`

/** A dev-owned, finalized character placed into Campaign B and standing as a PC
 *  combatant in its **live** encounter — the live console's turn-flow tests in
 *  `encounter-shell.spec.ts` (UNN-344) drive its turn. Dedicated (and thus
 *  live-locked) so no placement/lifecycle spec contends with it. */
const liveCombatPc = makeSeedCharacter({
  slug: "live-combat-pc",
  shortId: "live-combat-pc",
  name: "Roan Vale",
})

const LIVE_COMBAT_PC_ID = `seed-char-${liveCombatPc.slug}`

const campaignA = {
  id: "seed-campaign-encounter",
  shortId: "encounter-campaign",
  joinToken: "join-playtest",
  name: "Playtest Campaign",
} as const

const campaignB = {
  id: "seed-campaign-live",
  shortId: "live-campaign",
  joinToken: "join-live",
  name: "Live Campaign",
} as const

const foreignCampaign = {
  id: "seed-campaign-foreign",
  shortId: "foreign-campaign",
  joinToken: "join-foreign",
  name: "Foreign Campaign",
} as const

/** One seeded roster slot: a durable PC, a free-entered inline entity, or a
 *  catalog key materialized at build time. */
type SeedSetup =
  | { side: CombatSide; characterId: string }
  | { side: CombatSide; entity: (id: string) => Entity }
  | { side: CombatSide; catalog: string }

/** A free-entered inline enemy — name + flat attributes + HP, the v2 shape of
 *  v1's provisional stat block. */
function inlineEnemy(
  name: string,
  maxHP: number,
  attributes: { strength: number; magic: number; agility: number; luck: number }
): (id: string) => Entity {
  return (id) => ({
    id,
    components: {
      identity: { name },
      vitals: { base: maxHP, damage: 0 },
      attributes: { base: attributes },
    },
  })
}

/** A throwaway enemy combatant so the `blocked` draft's Start button is
 *  clickable (the single-live rejection is what the spec asserts). */
const enemySetup: SeedSetup = {
  side: "enemies",
  entity: inlineEnemy("Practice Dummy", 10, {
    strength: 0,
    magic: 0,
    agility: 0,
    luck: 0,
  }),
}

const pcSetup: SeedSetup = { side: "players", characterId: PLACED_PC_ID }

/** The live encounter's started roster (UNN-344): one PC on the players side and
 *  two enemies (a catalog goblin + an inline entity) so drafting, side
 *  alternation, and back-to-back finishing are all exercisable. */
const liveRoster: SeedSetup[] = [
  { side: "players", characterId: LIVE_COMBAT_PC_ID },
  { side: "enemies", catalog: "goblin" },
  {
    side: "enemies",
    entity: inlineEnemy("Cave Bat", 8, {
      strength: 0,
      magic: 0,
      agility: 2,
      luck: 0,
    }),
  },
]

/** A stable id generator so re-seeding doesn't churn the session blob. */
function deterministicIds(slug: string): () => string {
  let n = 0
  return () => `seed-combatant-${slug}-${n++}`
}

interface SeededEncounter {
  id: string
  shortId: string
  status: EncounterStatus
  campaignId: string
  url: string
  /** Canonical stored session — built once, used by the seed and the reset. */
  session: StoredSession
  /** The Map Instance this encounter references (UNN-459 — spatial truth moved
   *  off the session). Deterministic id so a re-seed is idempotent; rosters
   *  seed unplaced, so its occupancy starts empty. */
  mapInstanceId: string
  mapInstanceState: MapInstanceState
}

/** Resolves one setup to its stored participant (durable reference or live
 *  inline entity), keyed by the deterministic roster id. */
function storedParticipant(setup: SeedSetup, id: string): StoredParticipant {
  const participantId = asParticipantId(id)
  const overlay = defaultOverlay({ side: setup.side })
  if ("characterId" in setup) {
    return {
      id: participantId,
      locator: { storage: "durable", entityId: setup.characterId },
      overlay,
    }
  }
  const entity =
    "catalog" in setup ? instantiateEnemy(setup.catalog, id) : setup.entity(id)
  if (!entity) throw new Error(`unknown seed catalog key`)
  return {
    id: participantId,
    locator: {
      storage: "inline",
      entity: { id: entity.id, components: entity.components },
    },
    overlay,
  }
}

function seededEncounter(
  slug: string,
  status: EncounterStatus,
  campaign: { id: string; shortId: string },
  roster: SeedSetup[],
  start?: { advantage: "players" | "enemies" | "neutral"; firstSide: "players" }
): SeededEncounter {
  const nextId = deterministicIds(slug)
  // A `live` encounter has already run `startCombat`; the v2 reducer's arm
  // records exactly `advantage` + `firstSide` (round stays 1, actor null,
  // turnsTakenThisRound 0 — the defaults), so the started blob is assembled
  // directly and self-checked through the persisted-contract schema.
  const session = storedSessionSchema.parse({
    round: 1,
    currentActorId: null,
    advantage: start?.advantage ?? null,
    firstSide: start?.firstSide ?? null,
    participants: roster.map((setup) => storedParticipant(setup, nextId())),
  } satisfies StoredSession)
  return {
    id: `seed-encounter-${slug}`,
    shortId: `encounter-${slug}`,
    status,
    campaignId: campaign.id,
    url: encounterConsolePath(campaign.shortId, `encounter-${slug}`),
    session,
    mapInstanceId: `seed-mi-encounter-${slug}`,
    mapInstanceState: emptyMapInstance(),
  }
}

export const encounterTarget = {
  campaignA,
  campaignB,
  foreignCampaign,
  placedPc: { seed: placedPc, characterId: PLACED_PC_ID },
  liveCombatPc: { seed: liveCombatPc, characterId: LIVE_COMBAT_PC_ID },
  /** Campaign A, startable (A has no live encounter) — carries the placed PC. */
  draft: seededEncounter("draft", "draft", campaignA, [pcSetup]),
  /** Campaign A, read-only ended stub. */
  ended: seededEncounter("ended", "ended", campaignA, []),
  /** Campaign B's live encounter → the live combat console (UNN-344): a started
   *  session (neutral advantage, players first) with a PC + two enemies. */
  live: seededEncounter("live", "live", campaignB, liveRoster, {
    advantage: "neutral",
    firstSide: "players",
  }),
  /** Campaign B, draft — starting it is rejected by the single-live guard (B
   *  already has `live`). Seeded with one combatant so Start is clickable. */
  blocked: seededEncounter("blocked", "draft", campaignB, [enemySetup]),
  /** A `draft` in the foreign (seed-user) campaign — the dev user is not its DM,
   *  so the route must 404. */
  foreign: seededEncounter("foreign", "draft", foreignCampaign, []),
} as const

/** Campaign A's manage page — where the New-encounter dialog lives (UNN-329;
 *  relocated to the nested `manage/` route by the planner restructure, UNN-574). */
export const ENCOUNTER_CAMPAIGN_MANAGE_URL = `/campaigns/${campaignA.shortId}/manage`

/** Every seeded encounter, for the seed + reset loops. */
export const SEEDED_ENCOUNTERS: SeededEncounter[] = [
  encounterTarget.draft,
  encounterTarget.ended,
  encounterTarget.live,
  encounterTarget.blocked,
  encounterTarget.foreign,
]

/**
 * Restores the seeded encounters to their canonical baseline before each test:
 *
 *  1. **Deletes stray encounters** the create-flow test minted in the dev-DM
 *     campaigns (random `shortId`s `db:seed` can't reach) — otherwise a prior
 *     run's started encounter leaves Campaign A with a `live` row and the
 *     single-live guard blocks every subsequent happy-path Start.
 *  2. **Resets** each known seeded encounter's `status`, `version`, and `session`
 *     so a prior test's per-edit setup writes / "Start" don't carry over.
 *
 * The spec runs `serial` so these resets aren't racing a parallel test mutating
 * the same campaign-level live state.
 */
/**
 * A monotonically-increasing `version` baseline stamped onto the seeded rows by
 * every reset. The setup specs assert on the **optimistic** UI, so a per-edit
 * write can still be in flight at test teardown — and post-UNN-459 the roster
 * add/remove are slower `guardMany` **cross-writes**, so one can straddle into
 * the next serial test. Giving each reset a fresh baseline higher than any
 * in-flight write expected makes that stale write fail its version guard
 * (`"stale"`, a no-op) instead of colliding with a shared `version: 0` and
 * applying onto the freshly-reset row — which would empty it. The step exceeds
 * the handful of edits any single test issues, and the counter is per-process so
 * it never overflows the `integer` column across a run.
 */
let resetVersionBaseline = 0
const RESET_VERSION_STEP = 1000

/**
 * Reads an encounter's persisted {@link StoredSession} straight off the row —
 * the DB truth the specs `expect.poll` between dependent writes (the UNN-226
 * discipline). Parsed through the persisted-contract schema so a drifted blob
 * fails loudly rather than returning garbage.
 */
export async function getStoredSession(
  encounterId: string
): Promise<StoredSession> {
  const [row] = await getDb()
    .select({ session: encounters.session })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1)
  if (!row) throw new Error(`encounter ${encounterId} missing`)
  return storedSessionSchema.parse(row.session)
}

/** The persisted vitals of the encounter's first **inline** participant whose
 *  entity carries the given display name — where a catalog enemy's damage
 *  accumulates (the UNN-226 back-to-back regression reads this). The opaque
 *  components blob is validated through the engine's own load seam. */
export async function getInlineEnemyVitals(
  encounterId: string,
  name: string
): Promise<{ base: number; damage: number } | undefined> {
  const session = await getStoredSession(encounterId)
  for (const participant of session.participants) {
    if (participant.locator.storage !== "inline") continue
    const loaded = loadEntity(
      participant.locator.entity.id,
      participant.locator.entity.components
    )
    if (!loaded.ok) throw new Error(`inline entity failed to load: ${name}`)
    const { components } = loaded.value
    if (components.identity?.name === name) return components.vitals
  }
  return undefined
}

/** A participant's persisted side (overlay allegiance), keyed by the durable
 *  character it wraps — the DB truth behind the setup shell's side toggle. */
export async function getDurableParticipantSide(
  encounterId: string,
  characterId: string
): Promise<CombatSide | undefined> {
  const session = await getStoredSession(encounterId)
  const participant = session.participants.find(
    (candidate) =>
      candidate.locator.storage === "durable" &&
      candidate.locator.entityId === characterId
  )
  if (!participant) return undefined
  return overlayComponentsSchema.parse(participant.overlay).allegiance.side
}

/** The durable combatant's **resolved** current HP — where a durable HP write
 *  now lands (UNN-551): the `entity` row's signed `vitals.damage`, folded through
 *  `resolveEntity` (currentHP = maxHP − damage). The entity is the PC's combat
 *  storage home, never the session. */
export async function getCharacterCurrentHP(
  characterId: string
): Promise<number> {
  const row = await loadEntityRowById(characterId)
  if (!row) throw new Error(`entity ${characterId} missing`)
  const loaded = loadEntityRow(row)
  if (!loaded.ok)
    throw new Error(`entity ${characterId} has invalid components`)
  return resolveEntity(loaded.value).components.vitals?.currentHP ?? 0
}

/** Restores a seeded combatant's current HP by resetting its `entity` depletion —
 *  the fixture reset never touches entity rows, so a spec that damages a seeded PC
 *  puts the HP back itself. */
export async function setCharacterCurrentHP(
  characterId: string,
  currentHP: number
): Promise<void> {
  const row = await loadEntityRowById(characterId)
  if (!row) return
  const loaded = loadEntityRow(row)
  if (!loaded.ok) return
  const maxHP = resolveEntity(loaded.value).components.vitals?.maxHP ?? 0
  await getDb()
    .update(entity)
    .set({
      vitals: { base: row.vitals?.base ?? 0, damage: maxHP - currentHP },
    })
    .where(eq(entity.id, characterId))
}

export async function resetEncounterFixtures(): Promise<void> {
  const db = getDb()
  resetVersionBaseline += RESET_VERSION_STEP
  const version = resetVersionBaseline

  await db.delete(encounters).where(
    and(
      inArray(encounters.campaignId, [campaignA.id, campaignB.id]),
      notInArray(
        encounters.id,
        SEEDED_ENCOUNTERS.map((encounter) => encounter.id)
      )
    )
  )

  await Promise.all(
    SEEDED_ENCOUNTERS.map((encounter) =>
      db
        .update(mapInstances)
        .set({ state: encounter.mapInstanceState, version })
        .where(eq(mapInstances.id, encounter.mapInstanceId))
    )
  )

  await Promise.all(
    SEEDED_ENCOUNTERS.map((encounter) =>
      db
        .update(encounters)
        .set({
          status: encounter.status,
          version,
          session: encounter.session,
        })
        .where(eq(encounters.id, encounter.id))
    )
  )
}
