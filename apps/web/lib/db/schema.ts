import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"
import {
  ailmentsSchema,
  battleConditionsSchema,
  identityListSchema,
  inheritanceSlotsSchema,
  manualBonusesSchema,
  sparkLogSchema,
  type Ailments,
  type BattleConditions,
  type IdentityList,
  type InheritanceSlots,
  type ManualBonuses,
  type PathChoice,
  type SparkLog,
} from "../game/character"
import type { MechanicState } from "../game/mechanics"

/**
 * Tables below follow the canonical `@auth/drizzle-adapter` Postgres schema
 * so the Auth.js adapter is drop-in when authentication is wired up. The
 * adapter is not installed yet; only the table shapes are defined here.
 *
 * PRD §8 `User` maps onto this Auth.js shape: `displayName` → `name`,
 * `avatarUrl` → `image`, and `googleId` lives in `accounts` as
 * `provider = "google"` + `providerAccountId`.
 */
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
})

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
)

/**
 * The character sheet. Denormalized onto one row: in-session and progression
 * state lives here directly, with JSON columns for the structured bits
 * (manual bonuses, Spark log, Ailments, Battle Conditions, identity
 * lists). Computed
 * values (displayed Attributes, Affinity chart, max HP/SP) are never stored —
 * they are derived from this row plus hardcoded game data.
 */
export const characters = pgTable("character", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  ownerId: text("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pronouns: text("pronouns"),
  portraitUrl: text("portraitUrl"),
  level: integer("level").notNull().default(1),
  pathChoice: text("pathChoice").$type<PathChoice>().notNull(),
  currentHP: integer("currentHP").notNull(),
  currentSP: integer("currentSP").notNull(),
  hitDiceRemaining: integer("hitDiceRemaining").notNull().default(0),
  skillDiceRemaining: integer("skillDiceRemaining").notNull().default(0),
  manualBonuses: jsonb("manualBonuses")
    .$type<ManualBonuses>()
    .notNull()
    .default({}),
  virtueExpression: integer("virtueExpression").notNull().default(0),
  virtueEmpathy: integer("virtueEmpathy").notNull().default(0),
  virtueWisdom: integer("virtueWisdom").notNull().default(0),
  virtueFocus: integer("virtueFocus").notNull().default(0),
  sparkLog: jsonb("sparkLog").$type<SparkLog>().notNull().default([]),
  victories: integer("victories").notNull().default(0),
  currency: integer("currency").notNull().default(0),
  prismaCharges: integer("prismaCharges").notNull().default(2),
  prismaMaxCharges: integer("prismaMaxCharges").notNull().default(2),
  exhaustion: integer("exhaustion").notNull().default(0),
  ailments: jsonb("ailments").$type<Ailments>().notNull().default([]),
  battleConditions: jsonb("battleConditions").$type<BattleConditions>(),
  activeArchetypeId: text("activeArchetypeId").references(
    (): AnyPgColumn => characterArchetypes.id,
    { onDelete: "set null" }
  ),
  savedArchetypeRanks: integer("savedArchetypeRanks").notNull().default(0),
  ancestryText: text("ancestryText"),
  backgroundText: text("backgroundText"),
  backstoryText: text("backstoryText"),
  personalityTraits: jsonb("personalityTraits")
    .$type<IdentityList>()
    .notNull()
    .default([]),
  hopes: jsonb("hopes").$type<IdentityList>().notNull().default([]),
  dreams: text("dreams"),
  fears: jsonb("fears").$type<IdentityList>().notNull().default([]),
  secrets: jsonb("secrets").$type<IdentityList>().notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/**
 * One row per Archetype a character has unlocked. `id` is a surrogate so that
 * `characters.activeArchetypeId` and inherited-Skill references
 * (`inheritanceSlots[].sourceCharacterArchetypeId`) can point at a single
 * column; `(characterId, archetypeKey)` is the natural key. Mastery is
 * derived from `rank` (see `hasMasteryBonus`), never stored.
 */
export const characterArchetypes = pgTable(
  "characterArchetype",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    characterId: text("characterId")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    archetypeKey: text("archetypeKey").notNull(),
    rank: integer("rank").notNull().default(1),
    inheritanceSlots: jsonb("inheritanceSlots")
      .$type<InheritanceSlots>()
      .notNull()
      .default([]),
    /**
     * The Archetype's unique-mechanic state (e.g. Warrior's Perfection rank,
     * Mage's Stains slots). Null when the character has never set state on
     * this Archetype's mechanic — read paths coerce to `initialState()`.
     */
    mechanicState: jsonb("mechanicState").$type<MechanicState | null>(),
  },
  (characterArchetype) => [
    unique().on(
      characterArchetype.characterId,
      characterArchetype.archetypeKey
    ),
  ]
)

export const characterKnives = pgTable("characterKnife", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: text("characterId")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
})

export const characterChains = pgTable("characterChain", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: text("characterId")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
})

export const characterTalents = pgTable("characterTalent", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: text("characterId")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
})

/**
 * Inventory. Items are hardcoded catalog entries (PRD §6.2/§8): the row only
 * references the catalog by `catalogItemKey` and tracks whether it is
 * `equipped`. The item's name, description, slot, intrinsic attack, and
 * effects come from the catalog entry, not this row.
 */
export const inventoryItems = pgTable("inventoryItem", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: text("characterId")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  catalogItemKey: text("catalogItemKey").notNull(),
  equipped: boolean("equipped").notNull().default(false),
})

/**
 * Recent-actions log for undo. App logic caps this at the 10 most recent
 * entries per character and clears it on Full Rest; the table itself is
 * unbounded.
 */
export const actionLogEntries = pgTable("actionLogEntry", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: text("characterId")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { mode: "date" }).notNull().defaultNow(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<unknown>(),
  undoableUntil: timestamp("undoableUntil", { mode: "date" }),
})

/**
 * Runtime Zod schemas for Server Action input validation. JSON columns are
 * refined with their structural schemas so validation is real, not `any`.
 */
export const insertUserSchema = createInsertSchema(users)
export const selectUserSchema = createSelectSchema(users)

export const insertCharacterSchema = createInsertSchema(characters, {
  manualBonuses: manualBonusesSchema,
  sparkLog: sparkLogSchema,
  ailments: ailmentsSchema,
  battleConditions: battleConditionsSchema,
  personalityTraits: identityListSchema,
  hopes: identityListSchema,
  fears: identityListSchema,
  secrets: identityListSchema,
})
export const selectCharacterSchema = createSelectSchema(characters)

export const insertCharacterArchetypeSchema = createInsertSchema(
  characterArchetypes,
  { inheritanceSlots: inheritanceSlotsSchema }
)
export const selectCharacterArchetypeSchema =
  createSelectSchema(characterArchetypes)

export const insertCharacterKnifeSchema = createInsertSchema(characterKnives)
export const selectCharacterKnifeSchema = createSelectSchema(characterKnives)

export const insertCharacterChainSchema = createInsertSchema(characterChains)
export const selectCharacterChainSchema = createSelectSchema(characterChains)

export const insertCharacterTalentSchema = createInsertSchema(characterTalents)
export const selectCharacterTalentSchema = createSelectSchema(characterTalents)

export const insertInventoryItemSchema = createInsertSchema(inventoryItems)
export const selectInventoryItemSchema = createSelectSchema(inventoryItems)

export const insertActionLogEntrySchema = createInsertSchema(actionLogEntries)
export const selectActionLogEntrySchema = createSelectSchema(actionLogEntries)
