import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { and, eq, inArray } from "drizzle-orm"

import {
  dungeonStateSchema,
  mapInstanceStateSchema,
} from "@workspace/game-v2/spatial"

import {
  makeSeedCharacter,
  SEED_CHARACTERS,
  type SeedCharacter,
} from "../__fixtures__/seed-characters"
import {
  encounterTarget,
  SEEDED_ENCOUNTERS,
} from "../../e2e/fixtures/encounter-target"
import { insertSeedEntity } from "./seed-entity"

/**
 * Idempotent database seed. Persists the {@link SEED_CHARACTERS} roster so the
 * Character Sheet Display tickets have something to render. See Linear UNN-144.
 * The roster itself and the spec→stat hydration live in the fixtures module so
 * this script owns only persistence; the game-engine integration suite asserts
 * the same specs against the same source of truth.
 *
 * Re-running is safe: every row has a deterministic id derived from a stable
 * slug, the owning user and characters are upserted, and each character's child
 * rows are deleted then re-inserted — so a second run neither duplicates rows
 * nor changes any public `/c/{shortId}` URL.
 *
 * The db client reads `DATABASE_URL` lazily on first query, so the repo-root
 * `.env.local` is loaded (when `DATABASE_URL` is not already in the
 * environment) before any database call below. The root is the single source
 * of truth — `next.config.ts` and `drizzle.config.ts` follow the same
 * convention.
 *
 * Run with: `cd apps/web && npm run db:seed`
 */

if (!process.env.DATABASE_URL) {
  const envPath = fileURLToPath(
    new URL("../../../../.env.local", import.meta.url)
  )
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}

const { db, users, entity, campaigns, encounters, mapInstances, dungeons } =
  await import("./index")

/**
 * Single-purpose "other user" so the E2E `signed-in-non-owner` case has a
 * sheet that the dev user (Claude) does not own. Only {@link SEED_USER_OWNED}
 * is assigned to this owner — the rest of the showcase roster is dev-owned
 * (`DEV_USER`), giving local owner-mode verification a sheet per Archetype
 * (Warrior, Knight, Healer, Mage) without further reshuffling.
 *
 * See `e2e/owner-controls-slot.spec.ts` and `e2e/write-pattern.spec.ts` for
 * the load-bearing usage; everything else that consumes the showcase roster
 * runs unauthenticated and is indifferent to `ownerId`.
 */
const SEED_USER = {
  id: "seed-user",
  email: "seed@persona.local",
  name: "Persona System Seed",
} as const

/**
 * Slugs whose showcase row stays {@link SEED_USER}-owned. Anything else in
 * {@link SEED_CHARACTERS} is owned by {@link DEV_USER} so the dev user (the
 * one Claude signs in as) owns at least one character of each Archetype.
 */
const SEED_USER_OWNED: ReadonlySet<string> = new Set(["warrior"])

/**
 * Dev-only sign-in target (UNN-185). Has no `account` row, so the only path to
 * a session is via `POST /api/dev/sign-in` (locally) or Playwright's
 * `globalSetup` (in CI). Never used by the prod OAuth flow.
 */
const DEV_USER = {
  id: "dev-user-claude",
  email: "claude@unnamed-system.local",
  name: "Claude",
} as const

/**
 * A minimal character owned by {@link DEV_USER} so the Playwright auth fixture
 * (which signs in as Claude) has a sheet it owns to assert owner-mode chrome
 * against. UNN-176 added this so the {@link OwnerControlsSlot} E2E case has a
 * deterministic URL.
 *
 * **Do not target this character from write-path E2E specs.** Read-only specs
 * (`home`, `owner-controls-slot`, `authenticated`) assert against its stable
 * name "Iris Vey"; a write spec that mutates the name flakes them by
 * Playwright's fullyParallel default. Write specs use
 * {@link WRITE_TEST_CHARACTER} instead.
 */
const DEV_USER_CHARACTER = makeSeedCharacter({
  slug: "claude",
  shortId: "claude-1",
  name: "Iris Vey",
  pronouns: "she/her",
  items: [
    { catalogItemKey: "longsword", equipped: false },
    { catalogItemKey: "bladeturn-mail", equipped: false },
    { catalogItemKey: "zephyr-band", equipped: false },
  ],
})

async function seedCharacter(
  character: SeedCharacter,
  ownerId: string
): Promise<void> {
  await insertSeedEntity(character, ownerId, null)
  console.log(
    `  ✓ ${character.name} (/c/${character.shortId}) — L${character.level} ${character.activeArchetypeKey}`
  )
}

/**
 * Seeds the initiative-tracker prerequisites (UNN-335): a {@link DEV_USER}-owned
 * campaign, one PC placed into it (`characters.campaignId`), and one encounter
 * per lifecycle status (`draft` / `live` / `ended`) so the `/combat/{shortId}`
 * route's status fork and the create → setup → Start flow are exercisable E2E.
 * The DM is `DEV_USER` — the user the Playwright auth fixture signs in as — so
 * `requireCampaignDM` admits the test's writes. All ids are deterministic and
 * upserted, so re-running resets statuses (un-flipping a prior Start) without
 * duplicating rows.
 */
async function seedEncounterFixtures(): Promise<void> {
  await seedCharacter(encounterTarget.placedPc.seed, DEV_USER.id)

  const { campaignA, campaignB, foreignCampaign, placedPc, liveCombatPc } =
    encounterTarget

  // The PC standing as a combatant in Campaign B's live encounter (UNN-344).
  await seedCharacter(liveCombatPc.seed, DEV_USER.id)

  // Two dev-DM campaigns (A = startable draft + ended; B = live + a draft the
  // single-live guard rejects) and one foreign (seed-user) campaign for the 404
  // case. Per-spec write scaffolding (placement / surfaces / lifecycle) is no
  // longer seeded — those specs mint ephemeral rows via `e2e/fixtures/factory.ts`.
  const campaignRows = [
    { ...campaignA, dmUserId: DEV_USER.id },
    { ...campaignB, dmUserId: DEV_USER.id },
    { ...foreignCampaign, dmUserId: SEED_USER.id },
  ]
  for (const campaign of campaignRows) {
    await db
      .insert(campaigns)
      .values(campaign)
      .onConflictDoUpdate({ target: campaigns.id, set: campaign })
  }

  // Place each combat-showcase PC by minting its `entity` row with the
  // campaignId set (UNN-551): Campaign A gets the draft-roster / import-PCs PC,
  // Campaign B the combatant in its live encounter (UNN-344). The console /
  // snapshot / encounter-lock all key off the entity.
  await insertSeedEntity(placedPc.seed, DEV_USER.id, campaignA.id)
  await insertSeedEntity(liveCombatPc.seed, DEV_USER.id, campaignB.id)

  for (const encounter of SEEDED_ENCOUNTERS) {
    // Mint the Map Instance first (UNN-459 — `encounters.mapInstanceId` is
    // non-null + `restrict`): deterministic id so a re-seed upserts in place,
    // occupancy keyed to the same combatant ids the session carries.
    const instanceRow = {
      id: encounter.mapInstanceId,
      state: encounter.mapInstanceState,
      version: 0,
    }
    await db
      .insert(mapInstances)
      .values(instanceRow)
      .onConflictDoUpdate({ target: mapInstances.id, set: instanceRow })

    const row = {
      id: encounter.id,
      shortId: encounter.shortId,
      campaignId: encounter.campaignId,
      name: `Encounter: ${encounter.shortId}`,
      status: encounter.status,
      session: encounter.session,
      mapInstanceId: encounter.mapInstanceId,
      version: 0,
    }
    await db
      .insert(encounters)
      .values(row)
      .onConflictDoUpdate({ target: encounters.id, set: row })
    console.log(`  ✓ encounter ${encounter.status} (${encounter.url})`)
  }
}

/**
 * Seeds one showcase dungeon (UNN-462) into the dev-DM Campaign A so the
 * `/dungeon/{shortId}` route's load + DM gate is verifiable. The dungeon owns a
 * freshly-minted (empty) Map Instance — the exploration runtime the canvas/turn
 * loop layer onto in UNN-463/464. All ids are deterministic and upserted, so a
 * re-seed resets the row in place without duplicating it. The DM is `DEV_USER`
 * (the Playwright/dev sign-in target), so `getDungeonForDM` admits the dev user
 * and 404s everyone else.
 */
async function seedDungeonFixtures(): Promise<void> {
  const tokenPc = encounterTarget.placedPc.characterId
  const instanceRow = {
    id: "seed-dungeon-a-instance",
    state: mapInstanceStateSchema.parse({
      geometry: {
        zones: {
          "zone-entry": {
            id: "zone-entry",
            name: "Vault Entrance",
            description: "A cracked stone arch, half-sunk in brackish water.",
            dmNotes: "",
            position: { x: 0, y: 0 },
          },
          "zone-hall": {
            id: "zone-hall",
            name: "Flooded Hall",
            description: "",
            dmNotes: "Current pulls toward the crypt.",
            position: { x: 280, y: -40 },
          },
          "zone-crypt": {
            id: "zone-crypt",
            name: "Sunken Crypt",
            description: "",
            dmNotes: "The vault's prize rests here.",
            position: { x: 520, y: 60 },
          },
        },
        connections: {
          "conn-entry-hall": {
            id: "conn-entry-hall",
            fromZoneId: "zone-entry",
            toZoneId: "zone-hall",
            hidden: false,
            locked: false,
          },
          "conn-hall-crypt": {
            id: "conn-hall-crypt",
            fromZoneId: "zone-hall",
            toZoneId: "zone-crypt",
            hidden: false,
            locked: true,
          },
          "conn-entry-crypt": {
            id: "conn-entry-crypt",
            fromZoneId: "zone-entry",
            toZoneId: "zone-crypt",
            hidden: true,
            locked: false,
          },
        },
      },
      occupancy: {
        [tokenPc]: { zoneId: "zone-entry", engagement: { status: "free" } },
      },
      reveal: {
        revealedZoneIds: ["zone-entry"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    }),
    version: 0,
  }
  await db
    .insert(mapInstances)
    .values(instanceRow)
    .onConflictDoUpdate({ target: mapInstances.id, set: instanceRow })

  const dungeonRow = {
    id: "seed-dungeon-a",
    shortId: "dungeon-a",
    campaignId: encounterTarget.campaignA.id,
    mapInstanceId: instanceRow.id,
    name: "Delve: The Sunken Vault",
    status: "active" as const,
    state: dungeonStateSchema.parse({}),
    version: 0,
  }
  await db
    .insert(dungeons)
    .values(dungeonRow)
    .onConflictDoUpdate({ target: dungeons.id, set: dungeonRow })
  console.log(
    `  ✓ dungeon ${dungeonRow.status} (/dungeon/${dungeonRow.shortId})`
  )
}

async function seed(): Promise<void> {
  console.log("Seeding…")

  await db
    .insert(users)
    .values(SEED_USER)
    .onConflictDoUpdate({ target: users.id, set: SEED_USER })

  await db
    .insert(users)
    .values(DEV_USER)
    .onConflictDoUpdate({ target: users.id, set: DEV_USER })

  // Wipe any drafts left behind by previous runs (UNN-204). Builder drafts
  // get random `shortId`s the per-character upserts below can't reach, so
  // they'd accumulate forever otherwise. Seed characters are always
  // finalized, so scoping by `status='draft'` keeps the showcase roster
  // intact.
  await db
    .delete(entity)
    .where(
      and(
        inArray(entity.ownerId, [SEED_USER.id, DEV_USER.id]),
        eq(entity.status, "draft")
      )
    )

  for (const character of SEED_CHARACTERS) {
    const ownerId = SEED_USER_OWNED.has(character.slug)
      ? SEED_USER.id
      : DEV_USER.id
    await seedCharacter(character, ownerId)
  }

  await seedCharacter(DEV_USER_CHARACTER, DEV_USER.id)

  await seedEncounterFixtures()
  await seedDungeonFixtures()

  console.log(
    `Done. Seeded ${SEED_CHARACTERS.length + 1} showcase characters, 3 campaigns + ${SEEDED_ENCOUNTERS.length} encounters + 1 dungeon, and 1 dev user. ` +
      "Write-path E2E rows are minted per-run by e2e/fixtures/factory.ts."
  )
}

await seed()
