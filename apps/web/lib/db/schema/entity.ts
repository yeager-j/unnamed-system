import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"

import { campaigns } from "./campaign"
import { users } from "./user"

/**
 * The **entity** table (Characters v2 S0 — UNN-551): the durable home for every
 * v2 entity, one row per entity. It is the **component-column projection** of the
 * engine's durable `ComponentRegistry` (ADR §2.2, CH15): app/query **metadata**
 * columns the engine never reads, plus **one jsonb column per durable component**
 * holding that component's payload verbatim, with the uniform convention
 * **`NULL ⇔ component absent`**. The loader ({@link import("../../game-v2/entity-row-to-bag")})
 * lifts `name`/`portraitUrl` into the `identity`/`presentation` components and
 * gathers the non-null component columns into the runtime `Entity.components` bag.
 *
 * Storing components column-per-key (not one `components` jsonb bag) is what makes
 * the per-write-class concurrency system structurally sound: each class's write
 * footprint is a disjoint column set, so a guarded `UPDATE SET vitals = …` cannot
 * clobber a sibling class. The column set ↔ durable registry keys correspondence
 * is pinned by `conformance.test.ts`.
 *
 * Fresh-start (no backfill): this runs in parallel with the v1 `characters` table,
 * which the old sheet/builder keep reading until their slices land (S1/S2). An
 * entity may share its `id` with a `characters` row (shared-id decision) but the
 * tables are otherwise independent — no FK between them.
 */
export const entity = pgTable("entity", {
  // ── Metadata: app/query columns no engine fn reads ────────────────────────
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shortId: text("shortId").notNull().unique(),
  ownerId: text("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /**
   * The campaign this entity is placed into, or null when unplaced. Placement
   * grants the campaign's DM write access via `campaignId → campaign.dmUserId`
   * (`requireOwnerOrCampaignDM`). Nulled (not cascaded) on campaign deletion.
   */
  campaignId: text("campaignId").references(() => campaigns.id, {
    onDelete: "set null",
  }),
  /**
   * The entity kind. `'pc'` for now; the durable-NPC seam (CD7) is this column
   * gaining `'npc'`. The engine never branches on it — capability presence, not
   * kind, drives every engine path.
   */
  kind: text("kind").$type<EntityKind>().notNull().default("pc"),
  status: text("status").$type<EntityStatus>().notNull().default("draft"),
  builderStep: integer("builderStep").notNull().default(0),
  // `name`/`portraitUrl` are metadata columns LIFTED into the `identity` /
  // `presentation` components at load — engine-read AND queried (name is the list
  // sort key), universal across kinds.
  name: text("name").notNull(),
  portraitUrl: text("portraitUrl"),
  // App-owned content columns that are NOT rulebook constructs.
  pronouns: text("pronouns"),
  notes: text("notes"),
  /**
   * Soft-delete tombstone (R1 — UNN-571). `NULL ⇔ live`; a non-null timestamp
   * means the delete flow retired the row. Reads split three ways on *why* the
   * caller holds the id (see the module note in `queries/load-entity.ts`):
   * **discovery/identity** (character list, campaign roster, by-`shortId` load)
   * and **live occupancy/setup** (dungeon-occupancy roster reads, combat-setup
   * adds) both filter `deletedAt IS NULL` — a tombstone leaves every surface and
   * can't be wired into a new fight; **pinned persisted-locator hydration** (by
   * id from a stored encounter session, the live-encounter lock, the auth gates)
   * stays `deletedAt`-blind, because the lock keeps tombstones out of live fights
   * and resolving the persisted row — rather than dropping it to a
   * `missing-durable` dangling reference — is what lets history survive its
   * subjects (D4). See `lib/actions/entity/delete.ts` for the flip.
   */
  deletedAt: timestamp("deletedAt", { mode: "date" }),

  // ── One jsonb column per durable component (NULL ⇔ absent) ─────────────────
  // Typed off `ComponentRegistry` so a column's payload can't drift from the
  // engine's authored shape. Every key EXCEPT `identity`/`presentation` (lifted
  // from name/portraitUrl above) gets a column here; the conformance test pins it.
  attributes: jsonb("attributes").$type<ComponentRegistry["attributes"]>(),
  affinities: jsonb("affinities").$type<ComponentRegistry["affinities"]>(),
  vitals: jsonb("vitals").$type<ComponentRegistry["vitals"]>(),
  skillPool: jsonb("skillPool").$type<ComponentRegistry["skillPool"]>(),
  skills: jsonb("skills").$type<ComponentRegistry["skills"]>(),
  talents: jsonb("talents").$type<ComponentRegistry["talents"]>(),
  level: jsonb("level").$type<ComponentRegistry["level"]>(),
  path: jsonb("path").$type<ComponentRegistry["path"]>(),
  manualBonuses:
    jsonb("manualBonuses").$type<ComponentRegistry["manualBonuses"]>(),
  archetypes: jsonb("archetypes").$type<ComponentRegistry["archetypes"]>(),
  resources: jsonb("resources").$type<ComponentRegistry["resources"]>(),
  exhaustion: jsonb("exhaustion").$type<ComponentRegistry["exhaustion"]>(),
  mechanics: jsonb("mechanics").$type<ComponentRegistry["mechanics"]>(),
  equipment: jsonb("equipment").$type<ComponentRegistry["equipment"]>(),
  virtues: jsonb("virtues").$type<ComponentRegistry["virtues"]>(),
  narrative: jsonb("narrative").$type<ComponentRegistry["narrative"]>(),

  // ── Per-write-class optimistic-concurrency tokens (CH4) ────────────────────
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
 * The entity kind (metadata, not a component `kind` tag — F4). `'pc'` today; the
 * durable-NPC seam widens this to `'pc' | 'npc'`.
 */
type EntityKind = "pc"

/** The entity lifecycle gate: a builder draft, or a finalized playable entity. */
export type EntityStatus = "draft" | "finalized"

/** The persisted entity row shape (app storage — typed off the table). */
export type EntityRow = typeof entity.$inferSelect
