import { z } from "zod/v4"

import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
} from "@workspace/game-v2/kernel/vocab/combat"

/**
 * The **persisted** combat shapes (ADR §2.1; CD3) — the on-the-wire contract the
 * loader (UNN-516) consumes and the saver produces. They are deliberately distinct
 * from the runtime {@link import("./session").Session}/{@link
 * import("./session").Participant}: the persisted side names the **storage home**
 * exactly once (the {@link StoredEntityLocator}), and the runtime side names it
 * **never** (the F1 kill — the home is dissolved at the one loader boundary into a
 * uniform `Participant.entity`, the durable/inline fact kept out-of-band).
 *
 * Zod-first (UNN-520): {@link storedSessionSchema} is the single source — the app
 * shell parses the raw jsonb column through it at the boundary, and the types are
 * inferred, so the schema and the contract cannot drift. The schema validates the
 * **envelope only** (scalars, ids, locator arms); each entity's `components` and
 * each participant's `overlay` stay `unknown` here because their shape is
 * validated exactly once, downstream at the F6 seams ({@link
 * import("@workspace/game-v2/kernel/load-seam").loadEntity} + {@link
 * import("./overlay").overlayComponentsSchema} inside {@link
 * import("./load-session").loadSession}) — both locator arms flow through the same
 * seams, so a durable row and an inline blob are validated identically.
 */

/**
 * One persisted entity: a stable `id` plus its opaque `components` jsonb.
 */
export const storedEntitySchema = z.object({
  id: z.string().min(1),
  components: z.unknown(),
})

export type StoredEntity = z.infer<typeof storedEntitySchema>

/**
 * The **2-arm** storage locator — the only place a participant's storage home is
 * named (CD3, amended CD19). Its **shape carries the home**: `{ entityId }` is a
 * durable *reference* (PC / reusable NPC — its live components sit on the entity
 * row, written via their own path), `{ entity }` is an *inline* ephemeral combatant
 * (ad-hoc / object / a catalog enemy already materialized to inline at mint, whose
 * state lives in the session blob).
 *
 * Catalog is **not** a third arm — it is a setup-time template source, consumed once
 * at mint ({@link import("./session-factory").createSessionFactory}); by load time a
 * catalog enemy is indistinguishable from a free-entered inline one. The explicit
 * `storage` tag is redundant with the shape (CD19) but kept on the **persisted**
 * contract for a readable blob + a precise round-trip assertion; it never reaches a
 * runtime `Participant`.
 */
export const storedEntityLocatorSchema = z.discriminatedUnion("storage", [
  z.object({ storage: z.literal("durable"), entityId: z.string().min(1) }),
  z.object({ storage: z.literal("inline"), entity: storedEntitySchema }),
])

export type StoredEntityLocator = z.infer<typeof storedEntityLocatorSchema>

/**
 * One persisted participant: the roster `id` (the combatant key — distinct from
 * `entity.id`, since a durable entity could appear twice), its storage `locator`,
 * and its `overlay` blob (validated at load via {@link
 * import("./overlay").overlayComponentsSchema}).
 */
export const storedParticipantSchema = z.object({
  id: participantIdSchema,
  locator: storedEntityLocatorSchema,
  overlay: z.unknown(),
})

export type StoredParticipant = z.infer<typeof storedParticipantSchema>

/**
 * The persisted session blob the loader reads and the saver writes (§2.8a — the DM
 * is the sole blob writer). The four scalars carry verbatim (no normalisation,
 * R2.1); `mapInstanceId` is the inert Tier-3 seam. Durable participants are stored
 * as **references** here (no entity content — that lives on the row); only inline
 * participants carry their live entity in the blob.
 */
export const storedSessionSchema = z.object({
  round: z.number().int().positive(),
  currentActorId: participantIdSchema.nullable(),
  advantage: z.enum(COMBAT_ADVANTAGES).nullable(),
  firstSide: z.enum(COMBAT_SIDES).nullable(),
  mapInstanceId: z.string().optional(),
  participants: z.array(storedParticipantSchema),
})

export type StoredSession = z.infer<typeof storedSessionSchema>
