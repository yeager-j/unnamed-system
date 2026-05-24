import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"

import { MechanicState } from "@/lib/game/mechanics"

import {
  ailmentsSchema,
  battleConditionsSchema,
  identityListSchema,
  inheritanceSlotsSchema,
  manualBonusesSchema,
  partyCompositionSchema,
  sparkLogSchema,
  type Ailments,
  type BattleConditions,
  type IdentityList,
  type InheritanceSlots,
  type ManualBonuses,
  type PartyComposition,
  type PathChoice,
  type SparkLog,
} from "../../game/character"
import { users } from "./user"

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
  partyComposition: jsonb("partyComposition").$type<PartyComposition>(),
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
  dreams: jsonb("dreams").$type<IdentityList>().notNull().default([]),
  fears: jsonb("fears").$type<IdentityList>().notNull().default([]),
  secrets: jsonb("secrets").$type<IdentityList>().notNull().default([]),
  notes: text("notes"),
  /**
   * Per-write-class optimistic-concurrency tokens (UNN-140). One integer
   * counter per logical edit-surface group, conditioned on by the matching
   * `lib/db/*` wrapper and incremented in the same UPDATE. Decoupling
   * independent edit surfaces (identity vs vitals vs inventory vs
   * progression) prevents a blur in one field from falsely staling a
   * debounced save in flight on another. `updatedAt` stays as a "last
   * touched" display column but is no longer the concurrency token.
   */
  identityVersion: integer("identityVersion").notNull().default(0),
  vitalsVersion: integer("vitalsVersion").notNull().default(0),
  inventoryVersion: integer("inventoryVersion").notNull().default(0),
  progressionVersion: integer("progressionVersion").notNull().default(0),
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

export const insertCharacterSchema = createInsertSchema(characters, {
  manualBonuses: manualBonusesSchema,
  sparkLog: sparkLogSchema,
  ailments: ailmentsSchema,
  battleConditions: battleConditionsSchema,
  partyComposition: partyCompositionSchema,
  personalityTraits: identityListSchema,
  hopes: identityListSchema,
  dreams: identityListSchema,
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
