import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { Lineage } from "@workspace/game-v2/kernel/vocab"

import type { ParticipantKind } from "@/domain/planner/participant"

import { campaigns } from "./campaign"
import { campaignFolder } from "./campaign-folder"
import { entity } from "./entity"

/**
 * The kind of date an article carries (tech-design D5): a flavor `event` on the
 * calendar, or a `deadline` that counts down and gates the clock's advance.
 */
export type ArticleDatedKind = "event" | "deadline"

/**
 * A **relation** (phase 6, tech-design §3): one directed, free-form-labeled
 * edge in the campaign's world web, displayed on the source's page only. No
 * uniqueness — parallel edges with different labels are legal; "bidirectional"
 * is a write-time convenience that inserts the reverse row. Endpoints are
 * participant refs (no FK — the §5 boundary rule validates them); tombstoning
 * an endpoint hard-deletes its touching edges in both directions (D4).
 */
export const campaignRelation = pgTable(
  "campaignRelation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sourceKind: text("sourceKind").$type<ParticipantKind>().notNull(),
    sourceId: text("sourceId").notNull(),
    targetKind: text("targetKind").$type<ParticipantKind>().notNull(),
    targetId: text("targetId").notNull(),
    label: text("label"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (relation) => [
    index("campaignRelation_source_idx").on(
      relation.campaignId,
      relation.sourceKind,
      relation.sourceId
    ),
    index("campaignRelation_target_idx").on(
      relation.campaignId,
      relation.targetKind,
      relation.targetId
    ),
  ]
)

/**
 * A **campaign article** (Campaign Planner phase 2 — UNN-575, tech-design D4):
 * a DM-authored worldbuilding page — a place, faction, threat, or lore entry —
 * that participants can reference. `type` is a **label-only** free-text tag
 * (the picker offers a curated list ∪ the campaign's existing distinct values);
 * it never drives behavior.
 *
 * The **dated facet** (`datedDay` + `datedKind`, CHECK-enforced set-together —
 * D5) is minted here but unused until phase 5 (Calendar); deadline resolution
 * is derived from a ⚑ marker update, never stored on the article.
 *
 * Articles **tombstone** (`deletedAt`, D4): history survives its subjects —
 * timelines keep rendering the name muted, while tombstones leave the linker
 * and list surfaces.
 */
export const campaignArticle = pgTable(
  "campaignArticle",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** D11: tree membership; null ⇒ the derived Unfiled (never a magic row). */
    folderId: text("folderId").references(() => campaignFolder.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type"),
    /** Markdown body with inline participant chip tokens (D7). */
    body: text("body").notNull().default(""),
    datedDay: integer("datedDay"),
    datedKind: text("datedKind").$type<ArticleDatedKind>(),
    deletedAt: timestamp("deletedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (article) => [
    check(
      "campaignArticle_dated_set_together",
      sql`(${article.datedDay} IS NULL) = (${article.datedKind} IS NULL)`
    ),
    check(
      "campaignArticle_datedDay_min",
      sql`${article.datedDay} IS NULL OR ${article.datedDay} >= 1`
    ),
    index("campaignArticle_campaign_dated_idx").on(
      article.campaignId,
      article.datedKind,
      article.datedDay
    ),
  ]
)

/**
 * The **campaign-NPC subtype** (Campaign Planner phase 2 — UNN-575, tech-design
 * D2): the per-kind table that specializes a shared {@link entity} into an NPC,
 * the sibling of `playerCharacter` in the table-per-subtype scheme. Kind is
 * derived, not stored — a `campaignNpc` row pointing at an entity is what makes
 * it an NPC. The supertype+subtype pair mints in one transaction (the
 * one-subtype invariant; see `lib/db/writes/campaign-world.ts`).
 *
 * The subtype resolves "who may write this entity" (D2): an NPC carries **no
 * owner** — it is the campaign's, authorized by the DM alone via
 * `campaignId → campaign.dmUserId`. Identity/Origins prose is genuinely shared
 * with PCs: it lives in the entity's `narrative` component, not here.
 *
 * **Traits stay on the subtype, not in components** — the engine never reads
 * them. `arcana` is a narrative label (advisory uniqueness only: the picker
 * warns "held by ⟨name⟩" and allows it). `lineageKey` is the Atlas-gate lane
 * (D8), **hard-unique per campaign** via the partial index — every Lineage has
 * at most one gate-holder; deleting the NPC clears it (the Lineage returns to
 * the deck). `bondTier` (0–4) + `bondTierChangedAt` are the party↔NPC bond;
 * progress is derived from the update stream since the timestamp, never stored.
 */
export const campaignNpc = pgTable(
  "campaignNpc",
  {
    /**
     * The entity this subtype specializes — the shared-id PK (`= entity.id`). A
     * plain FK, **no cascade**: entities soft-delete (`entity.deletedAt`, R1),
     * so the subtype row persists alongside a tombstoned substrate row
     * (history survives its subjects, D4).
     */
    entityId: text("entityId")
      .primaryKey()
      .references(() => entity.id),
    campaignId: text("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** D11: tree membership; null ⇒ the derived Unfiled (never a magic row). */
    folderId: text("folderId").references(() => campaignFolder.id, {
      onDelete: "set null",
    }),
    arcana: text("arcana"),
    lineageKey: text("lineageKey").$type<Lineage>(),
    bondTier: integer("bondTier").notNull().default(0),
    bondTierChangedAt: timestamp("bondTierChangedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (npc) => [
    check("campaignNpc_bondTier_range", sql`${npc.bondTier} BETWEEN 0 AND 4`),
    index("campaignNpc_campaignId_idx").on(npc.campaignId),
    uniqueIndex("campaignNpc_campaign_lineage_unique")
      .on(npc.campaignId, npc.lineageKey)
      .where(sql`${npc.lineageKey} IS NOT NULL`),
  ]
)

/** The persisted relation row shape (typed off the table). */
export type CampaignRelationRow = typeof campaignRelation.$inferSelect

/** The persisted article row shape (typed off the table). */
export type CampaignArticleRow = typeof campaignArticle.$inferSelect

/** The persisted campaign-NPC subtype row shape (typed off the table). */
export type CampaignNpcRow = typeof campaignNpc.$inferSelect
