import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"

/**
 * The **persisted** combat shapes (ADR §2.1; CD3) — the on-the-wire contract the
 * loader (UNN-516) consumes and the saver produces. They are deliberately distinct
 * from the runtime {@link import("./session").Session}/{@link
 * import("./session").Participant}: the persisted side names the **storage home**
 * exactly once (the {@link StoredEntityLocator}), and the runtime side names it
 * **never** (the F1 kill — the home is dissolved at the one loader boundary into a
 * uniform `Participant.entity`, the durable/inline fact kept out-of-band).
 */

/**
 * One persisted entity: a stable `id` plus its opaque `components` jsonb. `unknown`
 * because the component **shape** is validated exactly once, at the F6 load seam
 * ({@link import("@workspace/game-v2/kernel/load-seam").loadEntity}) — both locator
 * arms flow through it, so a durable row and an inline blob are validated the same way.
 */
export interface StoredEntity {
  id: string
  components: unknown
}

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
export type StoredEntityLocator =
  | { storage: "durable"; entityId: string }
  | { storage: "inline"; entity: StoredEntity }

/**
 * One persisted participant: the roster `id` (the combatant key — distinct from
 * `entity.id`, since a durable entity could appear twice), its storage `locator`,
 * and its `overlay` blob (validated at load via {@link
 * import("./overlay").overlayComponentsSchema}).
 */
export interface StoredParticipant {
  id: ParticipantId
  locator: StoredEntityLocator
  overlay: unknown
}

/**
 * The persisted session blob the loader reads and the saver writes (§2.8a — the DM
 * is the sole blob writer). The four scalars carry verbatim (no normalisation,
 * R2.1); `mapInstanceId` is the inert Tier-3 seam. Durable participants are stored
 * as **references** here (no entity content — that lives on the row); only inline
 * participants carry their live entity in the blob.
 */
export interface StoredSession {
  round: number
  currentActorId: ParticipantId | null
  advantage: CombatAdvantage | null
  firstSide: CombatSide | null
  mapInstanceId?: string
  participants: StoredParticipant[]
}
