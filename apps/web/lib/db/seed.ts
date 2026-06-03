import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { and, eq, inArray } from "drizzle-orm"

import {
  archetypeId,
  buildSeedStatCharacter,
  makeSeedCharacter,
  SEED_CHARACTERS,
  type SeedCharacter,
} from "../__fixtures__/seed-characters"
import { DEV_USER_E2E_FIXTURES } from "../../e2e/fixtures"
import { encounterTarget } from "../../e2e/fixtures/encounter-target"
import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
} from "../game/character"
import { createCombatSession, type CombatantSetup } from "../game/encounter"

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

const {
  db,
  users,
  characters,
  characterArchetypes,
  characterKnives,
  characterChains,
  inventoryItems,
  campaigns,
  encounters,
} = await import("./index")

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

/**
 * The character's full max HP/SP, derived through the production stat engine so
 * a Mastered Archetype's bonus (and equipped-item bonuses) land in the
 * persisted pools exactly as the sheet will display them.
 */
function deriveMaxPools(character: SeedCharacter): { hp: number; sp: number } {
  const stats = buildSeedStatCharacter(character)
  return { hp: computeMaxHP(stats), sp: computeMaxSP(stats) }
}

async function seedCharacter(
  character: SeedCharacter,
  ownerId: string
): Promise<void> {
  const characterId = `seed-char-${character.slug}`
  const max = deriveMaxPools(character)
  const currentHP = character.damage ? character.damage.hp : max.hp
  const currentSP = character.damage ? character.damage.sp : max.sp
  const maxHitDice = computeMaxHitDice(character.level)
  const maxSkillDice = computeMaxSkillDice(character.level)
  const hitDiceRemaining = character.damage
    ? maxHitDice - character.damage.hitDiceSpent
    : maxHitDice
  const skillDiceRemaining = character.damage
    ? maxSkillDice - character.damage.skillDiceSpent
    : maxSkillDice

  const row = {
    id: characterId,
    shortId: character.shortId,
    ownerId,
    // Seed fixtures predate the builder wizard (UNN-204) and are always
    // shipped finalized — they need to round-trip through the My Characters
    // grid and the public sheet, neither of which surface drafts.
    status: "finalized" as const,
    name: character.name,
    pronouns: character.pronouns,
    level: character.level,
    pathChoice: character.pathChoice,
    currentHP,
    currentSP,
    hitDiceRemaining,
    skillDiceRemaining,
    manualBonuses: character.manualBonuses,
    virtueExpression: character.virtues.expression,
    virtueEmpathy: character.virtues.empathy,
    virtueWisdom: character.virtues.wisdom,
    virtueFocus: character.virtues.focus,
    sparkLog: character.sparkLog,
    victories: character.victories,
    exhaustion: character.exhaustion,
    ailments: character.ailments,
    battleConditions: character.battleConditions,
    partyComposition: character.partyComposition,
    // FK to a characterArchetype row; set after those rows exist.
    activeArchetypeId: null,
    savedArchetypeRanks: character.savedArchetypeRanks ?? 0,
    ancestryText: character.ancestryText,
    backgroundText: character.backgroundText,
    backstoryText: character.backstoryText,
    personalityTraits: character.personalityTraits,
    hopes: character.hopes,
    dreams: character.dreams,
    fears: character.fears,
    secrets: character.secrets,
    gainedTalents: character.gainedTalents,
    notes: character.notes,
  }

  await db
    .insert(characters)
    .values(row)
    .onConflictDoUpdate({ target: characters.id, set: row })

  // Replace every child row. Deleting the Archetype rows nulls
  // `activeArchetypeId` automatically (onDelete: "set null"), and the upsert
  // above already cleared it, so the delete order is unconstrained.
  await db
    .delete(characterArchetypes)
    .where(eq(characterArchetypes.characterId, characterId))
  await db
    .delete(characterKnives)
    .where(eq(characterKnives.characterId, characterId))
  await db
    .delete(characterChains)
    .where(eq(characterChains.characterId, characterId))
  await db
    .delete(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))

  await db.insert(characterArchetypes).values(
    character.archetypes.map((archetype) => ({
      id: archetypeId(character.slug, archetype.archetypeKey),
      characterId,
      archetypeKey: archetype.archetypeKey,
      rank: archetype.rank,
      inheritanceSlots: (archetype.inheritanceSlots ?? []).map((slot) => ({
        slotIndex: slot.slotIndex,
        sourceCharacterArchetypeId: archetypeId(
          character.slug,
          slot.sourceArchetypeKey
        ),
        skillKey: slot.skillKey,
      })),
      mechanicState: archetype.mechanicState ?? null,
    }))
  )

  if (character.knives.length > 0) {
    await db.insert(characterKnives).values(
      character.knives.map((knife, index) => ({
        id: `seed-knife-${character.slug}-${index}`,
        characterId,
        title: knife.title,
        description: knife.description,
        order: index,
      }))
    )
  }

  if (character.chains.length > 0) {
    await db.insert(characterChains).values(
      character.chains.map((chain, index) => ({
        id: `seed-chain-${character.slug}-${index}`,
        characterId,
        title: chain.title,
        description: chain.description,
        order: index,
      }))
    )
  }

  if (character.items.length > 0) {
    await db.insert(inventoryItems).values(
      character.items.map((item, index) => ({
        id: `seed-item-${character.slug}-${item.catalogItemKey}-${index}`,
        characterId,
        catalogItemKey: item.catalogItemKey,
        equipped: item.equipped,
        quantity: item.quantity ?? 1,
      }))
    )
  }

  await db
    .update(characters)
    .set({
      activeArchetypeId: archetypeId(
        character.slug,
        character.activeArchetypeKey
      ),
      originCharacterArchetypeId: archetypeId(
        character.slug,
        character.originArchetypeKey ?? character.activeArchetypeKey
      ),
    })
    .where(eq(characters.id, characterId))

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

  const { campaign, placedPc, draft, live, ended } = encounterTarget

  await db
    .insert(campaigns)
    .values({
      id: campaign.id,
      shortId: campaign.shortId,
      dmUserId: DEV_USER.id,
      name: campaign.name,
    })
    .onConflictDoUpdate({
      target: campaigns.id,
      set: {
        shortId: campaign.shortId,
        dmUserId: DEV_USER.id,
        name: campaign.name,
      },
    })

  await db
    .update(characters)
    .set({ campaignId: campaign.id })
    .where(eq(characters.id, placedPc.characterId))

  const pcSetup: CombatantSetup = {
    side: "players",
    ref: { kind: "pc", characterId: placedPc.characterId },
    zoneId: "zone-1",
  }
  const deterministicId = (slug: string) => {
    let n = 0
    return () => `seed-combatant-${slug}-${n++}`
  }

  const rosters: Record<string, CombatantSetup[]> = {
    [draft.id]: [pcSetup],
    [live.id]: [pcSetup],
    [ended.id]: [],
  }

  for (const encounter of [draft, live, ended]) {
    const row = {
      id: encounter.id,
      shortId: encounter.shortId,
      campaignId: campaign.id,
      name: `${campaign.name} — ${encounter.status}`,
      status: encounter.status,
      session: createCombatSession(
        rosters[encounter.id]!,
        deterministicId(encounter.shortId)
      ),
      version: 0,
    }
    await db
      .insert(encounters)
      .values(row)
      .onConflictDoUpdate({ target: encounters.id, set: row })
    console.log(`  ✓ encounter ${encounter.status} (${encounter.url})`)
  }

  // A foreign campaign (DM = seed-user) + encounter so the DM-only route can be
  // proven to 404 for the dev user, who is not its DM.
  const { foreignCampaign, foreign } = encounterTarget
  await db
    .insert(campaigns)
    .values({
      id: foreignCampaign.id,
      shortId: foreignCampaign.shortId,
      dmUserId: SEED_USER.id,
      name: foreignCampaign.name,
    })
    .onConflictDoUpdate({
      target: campaigns.id,
      set: {
        shortId: foreignCampaign.shortId,
        dmUserId: SEED_USER.id,
        name: foreignCampaign.name,
      },
    })

  const foreignRow = {
    id: foreign.id,
    shortId: foreign.shortId,
    campaignId: foreignCampaign.id,
    name: foreignCampaign.name,
    status: foreign.status,
    session: createCombatSession([], deterministicId(foreign.shortId)),
    version: 0,
  }
  await db
    .insert(encounters)
    .values(foreignRow)
    .onConflictDoUpdate({ target: encounters.id, set: foreignRow })
  console.log(`  ✓ foreign encounter (${foreign.url})`)
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
    .delete(characters)
    .where(
      and(
        inArray(characters.ownerId, [SEED_USER.id, DEV_USER.id]),
        eq(characters.status, "draft")
      )
    )

  for (const character of SEED_CHARACTERS) {
    const ownerId = SEED_USER_OWNED.has(character.slug)
      ? SEED_USER.id
      : DEV_USER.id
    await seedCharacter(character, ownerId)
  }

  await seedCharacter(DEV_USER_CHARACTER, DEV_USER.id)
  for (const fixture of DEV_USER_E2E_FIXTURES) {
    await seedCharacter(fixture.seed, DEV_USER.id)
  }

  await seedEncounterFixtures()

  console.log(
    `Done. Seeded ${SEED_CHARACTERS.length + 2 + DEV_USER_E2E_FIXTURES.length} characters, 1 campaign + 3 encounters, and 1 dev user.`
  )
}

await seed()
