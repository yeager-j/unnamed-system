import { z } from "zod/v4"

/**
 * The **participant / roster id** brand — engine-wide roster-slot identity vocab.
 * Homed in `kernel/` (sibling of {@link import("./identity.schema").Identity}, SD3)
 * because three domains share it — `encounter/` and `visibility/` already, and now
 * `spatial/`: the {@link import("./vocab/engagement").Engagement} shape references
 * it, and a vocab module in `kernel/` cannot reach up into `encounter/ids`. The
 * encounter subsystem juggles two id namespaces, both physically `string`:
 *
 * - the **entity id** (`Entity.id`) — a durable character / inline entity, and
 * - the **participant id** (`Participant.id`) — the encounter *slot* a combatant
 *   occupies. A durable entity can in principle occupy two slots, overlay + turn
 *   order key on the slot, and engagement targets name slots.
 *
 * Conflating them caused a real bug in UNN-519 (an entity id flowed into a slot
 * that needed the roster id). Branding **only** the participant id — leaving the
 * entity id a plain `string` — turns the dangerous direction into a compile error
 * (`string` / entity-id will not assign to a {@link ParticipantId}) at minimal
 * cost: every entity-constructing test in the package keeps passing bare strings.
 *
 * `participantIdSchema` is the Zod surface (used by `combatEventSchema` +
 * `kernel/vocab/engagement` so the schema-inferred type *is* {@link ParticipantId},
 * keeping the `session-event.ts` lockstep intact); {@link asParticipantId} is the
 * cheap mint for trusted ids (`newId()` output, test literals) that skips
 * re-validation.
 */
export const participantIdSchema = z.string().min(1).brand<"ParticipantId">()

export type ParticipantId = z.infer<typeof participantIdSchema>

/** Brands a trusted `string` as a {@link ParticipantId} without re-validating —
 *  for `newId()` output and test fixtures, never untrusted wire input (parse that
 *  through {@link participantIdSchema}). */
export const asParticipantId = (id: string): ParticipantId =>
  id as ParticipantId
