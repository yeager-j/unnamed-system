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

import {
  ailmentsSchema,
  battleConditionsSchema,
  gainedTalentsSchema,
  inheritanceSlotsSchema,
  manualBonusesSchema,
  MechanicState,
  partyCompositionSchema,
  sparkLogSchema,
  type Ailments,
  type BattleConditions,
  type CharacterStatus,
  type InheritanceSlots,
  type ManualBonuses,
  type PartyComposition,
  type PathChoice,
  type SparkLog,
  type TalentKey,
} from "@workspace/game/foundation"

import { campaigns } from "./campaign"
import { users } from "./user"

/**
 * The character sheet. Denormalized onto one row: in-session and progression
 * state lives here directly, with JSON columns for the structured bits
 * (manual bonuses, Spark log, Ailments, Battle Conditions, identity
 * lists). Computed
 * values (displayed Attributes, Affinity chart, max HP/SP) are never stored —
 * they are derived from this row plus hardcoded game data. The row's TypeScript
 * shape ({@link CharacterRow}) and its lifecycle status ({@link CharacterStatus})
 * are owned by the game domain (`@/lib/game/character`); the conformance asserts
 * at the bottom of this file prove this table matches that contract.
 */
export const characters = pgTable("character", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  ownerId: text("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /**
   * The campaign this character is *placed* into, or null when unplaced (ADR
   * Decision 9). Placement is an owner action and grants the campaign's DM
   * write access via the single FK hop `campaignId → campaign.dmUserId`
   * (`requireOwnerOrCampaignDM`, UNN-297). A character is in at most one
   * campaign at a time. On campaign deletion / leave / kick this is nulled, not
   * cascaded — the character outlives the campaign.
   */
  campaignId: text("campaignId").references(() => campaigns.id, {
    onDelete: "set null",
  }),
  /**
   * Wizard lifecycle gate (UNN-204). New rows start as `"draft"`; the Review
   * step in UNN-206 flips this to `"finalized"`. Reads outside the builder
   * (My Characters list, public sheet) filter on this.
   */
  status: text("status").$type<CharacterStatus>().notNull().default("draft"),
  /**
   * Highest wizard step the player has reached, indexed into the shared
   * `BUILDER_STEPS` array. Used so the "Resume building" CTA on a draft card
   * deep-links to the right step. Stays at the final step's index after
   * finalization; no consumer reads it for finalized characters.
   */
  builderStep: integer("builderStep").notNull().default(0),
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
  /**
   * The character's **Origin** Archetype (rulebook 1.3) — the one Archetype
   * chosen at creation, ranked up twice, and permanent thereafter. Unlike
   * {@link activeArchetypeId}, which can change post-MVP as the character
   * switches between unlocked Archetypes, Origin never changes once set, and
   * only the Origin Lineage's Paragon is ever unlockable.
   *
   * Nullable only because a builder draft (UNN-204) inserts the `character`
   * row before any `characterArchetype` row exists; it is set the moment the
   * player picks their Origin in the builder (`setOriginArchetype`), alongside
   * `activeArchetypeId`. The loader asserts that a non-null value references a
   * sibling row of the same character.
   */
  originCharacterArchetypeId: text("originCharacterArchetypeId").references(
    (): AnyPgColumn => characterArchetypes.id,
    { onDelete: "set null" }
  ),
  savedArchetypeRanks: integer("savedArchetypeRanks").notNull().default(0),
  ancestryText: text("ancestryText"),
  backgroundText: text("backgroundText"),
  backstoryText: text("backstoryText"),
  personalityTraits: text("personalityTraits"),
  hopes: text("hopes"),
  dreams: text("dreams"),
  fears: text("fears"),
  secrets: text("secrets"),
  /**
   * Talents the character has picked up via Background or downtime learning
   * (rulebook 2.1). The active Archetype's Talents are derived at hydration
   * via {@link resolveTalents} and never stored here — switching Archetypes at
   * Respite naturally swaps which derived Talents apply.
   */
  gainedTalents: jsonb("gainedTalents")
    .$type<TalentKey[]>()
    .notNull()
    .default([]),
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

/**
 * Inventory. Items are hardcoded catalog entries (PRD §6.2/§8): the row only
 * references the catalog by `catalogItemKey` and tracks whether it is
 * `equipped` and how many are stacked (`quantity`). The item's name,
 * description, and capabilities (equip slot, intrinsic attack, effects,
 * stackSize) come from the catalog entry, not this row.
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
  quantity: integer("quantity").notNull().default(1),
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
  gainedTalents: gainedTalentsSchema,
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

export const insertInventoryItemSchema = createInsertSchema(inventoryItems)
export const selectInventoryItemSchema = createSelectSchema(inventoryItems)

export const insertActionLogEntrySchema = createInsertSchema(actionLogEntries)
export const selectActionLogEntrySchema = createSelectSchema(actionLogEntries)

/**
 * The persisted row shapes the pure derivation layer reads. `CharacterRow`,
 * `CharacterArchetypeRow`, and `InventoryItemRow` are **owned by the game
 * domain** (`@/lib/game/character` → `records.ts`) so the engine never depends
 * on this persistence layer; the asserts below prove each table's inferred shape
 * conforms to that contract, so the two can't drift. `CharacterKnife`/
 * `CharacterChain` have no engine consumer, so they stay inferred here. The
 * drift guard lives in `conformance.test.ts` (a typechecked `expectTypeOf`).
 */
export type {
  CharacterArchetypeRow,
  CharacterChainRow,
  CharacterKnifeRow,
  CharacterRow,
  CharacterStatus,
  InventoryItemRow,
} from "@workspace/game/foundation"
