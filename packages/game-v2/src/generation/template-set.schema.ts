import { z } from "zod/v4"

/**
 * A **Template Set**'s authored content — the user-owned, campaign-agnostic
 * grammar a Region rolls from at generation time (Procedural Dungeons PRD,
 * *Template Sets*). Declared in v2 as pure Zod (D32); no `@workspace/game`
 * import. Persisted as one jsonb blob on the `templateSet` row, guarded by a
 * single `version` token (the column, never part of this shape) — the same
 * optimistic-concurrency shape as a Map's `geometry`.
 *
 * The Region reads the **live** set (no per-expedition snapshot), so tuning a
 * weight or adding a template applies from the next roll onward. Nothing consumes
 * the grammar at runtime yet (P3); P1 is the authoring library standing alone.
 *
 * **Keys are opaque strings** — `nanoid(8)` ids minted app-side by the edit
 * helpers, referenced by id and displayed by name. The schema imposes no format
 * (`z.string()`); nothing reads a key's human-readability. A template/table
 * carries its own `key` as a field (self-describing, like `mapZoneSchema.id`),
 * kept in sync with its record key by the editor.
 */

/** The named engine constant for a set's default loop-closure probability — the
 *  PRD's "defaulting low" given a number (the docs name no value). A per-set
 *  knob on {@link templateSetContentSchema}; the generation roll consults it
 *  when a stub has a nearby closure candidate (P3). */
export const DEFAULT_CLOSURE_CHANCE = 0.1

/**
 * One row of a content table's roll — an authored `weight` plus the `entries`
 * stamped onto a zone (or awarded / narrated) when the row is drawn. A table row
 * is used three ways (zone contents, loot, the Region's wandering table), all one
 * shape. Weights are the authored truth; the d100 ranges the DM rolls against are
 * a pure projection ({@link import("./d100-ranges").d100Ranges}), never stored.
 */
export const tableEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("enemy"),
    enemyKey: z.string(),
    count: z.number().int().min(1).default(1),
  }),
  z.object({ kind: z.literal("item"), itemKey: z.string() }),
  z.object({ kind: z.literal("currency"), dice: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
])
export type TableEntry = z.infer<typeof tableEntrySchema>

/** One weighted row of a {@link contentTableSchema} — its draw weight plus the
 *  entries it stamps. `weight` `0` never rolls (an authored-but-parked row). */
export const contentTableRowSchema = z.object({
  weight: z.number().min(0).default(1),
  entries: z.array(tableEntrySchema).default([]),
})
export type ContentTableRow = z.infer<typeof contentTableRowSchema>

/**
 * A **content table** — a set-level, named, referenced roll (PRD, *Template
 * Sets*): authored once, used by many templates' `contentRolls` and by the
 * Region's wandering designation. Carries its own `key` (also its key in
 * {@link TemplateSetContent.tables}) so a table is self-describing.
 */
export const contentTableSchema = z.object({
  key: z.string(),
  name: z.string().default(""),
  rows: z.array(contentTableRowSchema).default([]),
})
export type ContentTable = z.infer<typeof contentTableSchema>

/** A Zone template's **site** defaults — present only on templates that are sites
 *  (unique or portal, PRD:133). The pre-tick + defaulted knobs the delve-setup
 *  checklist and mid-run declarations read (P4). */
export const zoneTemplateSiteSchema = z.object({
  appearByDefault: z.boolean().default(false),
  defaultMinDepth: z.number().int().min(0).default(0),
  defaultUrgency: z.enum(["session", "eventually"]).default("eventually"),
})
export type ZoneTemplateSite = z.infer<typeof zoneTemplateSiteSchema>

/** One authored exit slot on a template. `optional` exits may be culled at mint,
 *  giving variable connectivity without per-exit authoring (PRD, *Zone
 *  template*). Per-exit `accepts` is a deliberate deferral (two-way door). */
export const zoneTemplateExitSchema = z.object({
  optional: z.boolean().default(false),
})
export type ZoneTemplateExit = z.infer<typeof zoneTemplateExitSchema>

/** One reference from a template to a content table: `chance` (0..1) × the
 *  set-level table drawn when the roll hits at mint (PRD, *Content rolls*). */
export const contentRollSchema = z.object({
  chance: z.number().min(0).max(1).default(0),
  tableKey: z.string(),
})
export type ContentRoll = z.infer<typeof contentRollSchema>

/**
 * A **Zone template** (tech design §2) — the grammar unit a generation roll mints
 * into a zone. `tags`/`accepts` express adjacency legality **once per template**
 * (checked two-way at expansion, never O(N²) pairwise); `weight` `0` never rolls
 * (a site-by-choice profile); `unique` caps it at one mint per expedition;
 * `portalMapId` makes it a portal; `site` carries the checklist defaults;
 * `contentRolls` reference set tables. `tombstoned` stops the template appearing
 * in random rolls while keeping existing references resolvable (PRD, *Template
 * Sets*) — the non-destructive delete for a referenced template.
 *
 * Every field defaults so a freshly-minted template parses; `key` is required
 * (the edit helper mints it up front). Field-defaulting here is what lets an old
 * blob heal on read and keeps parse a fixed point.
 */
export const zoneTemplateSchema = z.object({
  key: z.string(),
  name: z.string().default(""),
  description: z.string().default(""),
  dmNotes: z.string().default(""),
  tags: z.array(z.string()).default([]),
  accepts: z.array(z.string()).default([]),
  exits: z.array(zoneTemplateExitSchema).default([]),
  weight: z.number().min(0).default(1),
  unique: z.boolean().default(false),
  portalMapId: z.string().optional(),
  site: zoneTemplateSiteSchema.optional(),
  contentRolls: z.array(contentRollSchema).default([]),
  tombstoned: z.boolean().optional(),
})
export type ZoneTemplate = z.infer<typeof zoneTemplateSchema>

/**
 * Reconciles an authored order array against its record's keys: keep the ordered
 * keys that still exist (de-duplicated), drop the missing, then append any record
 * key the order omits in **record iteration order**. Pure and a **fixed point** —
 * once every key appears exactly once the reconcile is a no-op, so `parse ∘ parse`
 * equals `parse` (the load-schema fixed-point law). Postgres jsonb canonicalizes
 * object key order, so the authored template/table sequence cannot ride on
 * `Object.keys` — it lives in these arrays (same rationale as `mapGeometry`'s
 * `orderedPages`, one storage tier down).
 */
function reconcileOrder(
  order: readonly string[],
  record: Record<string, unknown>
): string[] {
  const keys = new Set(Object.keys(record))
  const seen = new Set<string>()
  const result: string[] = []
  for (const key of order) {
    if (keys.has(key) && !seen.has(key)) {
      result.push(key)
      seen.add(key)
    }
  }
  for (const key of Object.keys(record)) {
    if (!seen.has(key)) {
      result.push(key)
      seen.add(key)
    }
  }
  return result
}

/**
 * The `templateSet` row's jsonb `content` (tech design §2). `templates`/`tables`
 * key an opaque id to its declaration; `templateOrder`/`tableOrder` carry the
 * authored display sequence the jsonb round-trip would otherwise lose (reconciled
 * against the records on parse). `connectorTemplateKey` designates the always-legal
 * empty-pool fallback template (lint checks it); `closureChance` is the per-set
 * loop-closure knob (PRD — it lives here, not on `region.settings`).
 *
 * Every field defaults so `.parse({})` mints a valid empty set (the `createMap`
 * pattern), and the `.transform` reconcile keeps the whole parse idempotent.
 */
export const templateSetContentSchema = z
  .object({
    templates: z.record(z.string(), zoneTemplateSchema).default({}),
    tables: z.record(z.string(), contentTableSchema).default({}),
    templateOrder: z.array(z.string()).default([]),
    tableOrder: z.array(z.string()).default([]),
    connectorTemplateKey: z.string().optional(),
    closureChance: z.number().min(0).max(1).default(DEFAULT_CLOSURE_CHANCE),
  })
  .transform((content) => ({
    ...content,
    templateOrder: reconcileOrder(content.templateOrder, content.templates),
    tableOrder: reconcileOrder(content.tableOrder, content.tables),
  }))
export type TemplateSetContent = z.infer<typeof templateSetContentSchema>
