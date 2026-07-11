import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { campaigns } from "./campaign"
import { entity } from "./entity"
import { users } from "./user"

/**
 * The **player-character subtype** (Characters v2 R3 — UNN-573): the per-kind table
 * that specializes a shared {@link entity} into a PC, owning its lifecycle and
 * authorization metadata (tech-design D2). This is textbook table-per-subtype
 * (class-table inheritance): `entity` is the supertype — the component-column
 * projection + name/portrait + version tokens; the columns that are *about the PC's
 * placement and builder lifecycle* — its owner, its campaign placement, its
 * draft/finalized status, and how far the builder has progressed — live here on the
 * subtype, keyed one-to-one by `entityId`.
 *
 * **Kind is derived, not stored.** Before R3, `entity.kind` was a `'pc'` column;
 * now an entity's kind is *which subtype table points at it* — a `playerCharacter`
 * row means it is a PC. The forthcoming Campaign Planner adds the sibling
 * `campaignNpc` subtype for NPC entities.
 *
 * **One-subtype invariant (app discipline, not a DB constraint):** an entity has
 * **exactly one** subtype row — a `playerCharacter` or (later) a `campaignNpc`,
 * never both, never neither. The supertype+subtype pair is minted in one
 * transaction at every write site (see `lib/actions/entity/start-draft.ts` and
 * `lib/db/seed-entity.ts`), mirroring the shared-id convention S0 established, so
 * an encounter's durable locator (`entityId === characterId`) resolves the same
 * substrate row whichever subtype specializes it.
 */
export const playerCharacter = pgTable(
  "playerCharacter",
  {
    /**
     * The entity this subtype specializes — the shared-id PK (`= entity.id`). A
     * plain FK, **no cascade**: entities soft-delete (`entity.deletedAt`, R1) and
     * are never hard-deleted, so the subtype row persists alongside a tombstoned
     * substrate row (history survives its subjects, D4). Free referential integrity.
     */
    entityId: text("entityId")
      .primaryKey()
      .references(() => entity.id),
    /**
     * The owning user (was `entity.ownerId`). Cascades on user delete, preserving
     * the pre-R3 "delete a user removes their characters" behavior on the subtype.
     */
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The campaign this PC is placed into, or null when unplaced (was
     * `entity.campaignId`). Placement grants the campaign's DM write access via
     * `campaignId → campaign.dmUserId` (`requireOwnerOrCampaignDMForEntity`).
     * Nulled (not cascaded) on campaign deletion.
     */
    campaignId: text("campaignId").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<PlayerCharacterStatus>()
      .notNull()
      .default("draft"),
    builderStep: integer("builderStep").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (pc) => [
    index("playerCharacter_userId_idx").on(pc.userId),
    index("playerCharacter_campaignId_idx").on(pc.campaignId),
  ]
)

/** The PC lifecycle gate: a builder draft, or a finalized playable character. */
export type PlayerCharacterStatus = "draft" | "finalized"

/** The persisted player-character subtype row shape (typed off the table). */
export type PlayerCharacterRow = typeof playerCharacter.$inferSelect
