import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { eq } from "drizzle-orm"

import {
  archetypeId,
  buildSeedStatCharacter,
  SEED_CHARACTERS,
  type SeedCharacter,
} from "../__fixtures__/seed-characters"
import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
} from "../game/stats"

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
  characterTalents,
  inventoryItems,
} = await import("./index")

const SEED_USER = {
  id: "seed-user",
  email: "seed@persona.local",
  name: "Persona System Seed",
} as const

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
 * deterministic URL — the showcase {@link SEED_CHARACTERS} roster stays
 * SEED_USER-owned and continues to serve as the signed-in-non-owner case.
 */
const DEV_USER_CHARACTER: SeedCharacter = {
  slug: "claude",
  shortId: "claude-1",
  name: "Iris Vey",
  pronouns: "she/her",
  level: 1,
  pathChoice: "balanced",
  activeArchetypeKey: "warrior",
  archetypes: [
    {
      archetypeKey: "warrior",
      rank: 1,
      mechanicState: { kind: "perfection", rank: 0 },
    },
  ],
  manualBonuses: {},
  ancestryText: "",
  backgroundText: "",
  backstoryText: "",
  personalityTraits: [],
  hopes: [],
  dreams: [],
  fears: [],
  secrets: [],
  notes: "",
  knives: [],
  chains: [],
  talents: [],
  items: [],
  victories: 0,
  virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
  sparkLog: [],
  exhaustion: 0,
  ailments: [],
  battleConditions: null,
}

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
    // FK to a characterArchetype row; set after those rows exist.
    activeArchetypeId: null,
    ancestryText: character.ancestryText,
    backgroundText: character.backgroundText,
    backstoryText: character.backstoryText,
    personalityTraits: character.personalityTraits,
    hopes: character.hopes,
    dreams: character.dreams,
    fears: character.fears,
    secrets: character.secrets,
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
    .delete(characterTalents)
    .where(eq(characterTalents.characterId, characterId))
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

  if (character.talents.length > 0) {
    await db.insert(characterTalents).values(
      character.talents.map((name, index) => ({
        id: `seed-talent-${character.slug}-${index}`,
        characterId,
        name,
      }))
    )
  }

  if (character.items.length > 0) {
    await db.insert(inventoryItems).values(
      character.items.map((item) => ({
        id: `seed-item-${character.slug}-${item.catalogItemKey}`,
        characterId,
        catalogItemKey: item.catalogItemKey,
        equipped: item.equipped,
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
    })
    .where(eq(characters.id, characterId))

  console.log(
    `  ✓ ${character.name} (/c/${character.shortId}) — L${character.level} ${character.activeArchetypeKey}`
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

  for (const character of SEED_CHARACTERS) {
    await seedCharacter(character, SEED_USER.id)
  }

  await seedCharacter(DEV_USER_CHARACTER, DEV_USER.id)

  console.log(
    `Done. Seeded ${SEED_CHARACTERS.length + 1} characters and 1 dev user.`
  )
}

await seed()
