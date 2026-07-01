import { z } from "zod/v4"

import {
  combatEventSchema,
  storedEntitySchema,
} from "@workspace/game-v2/encounter"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import { COMBAT_SIDES } from "@workspace/game-v2/kernel/vocab/combat"
import { mapInstanceEventSchema } from "@workspace/game-v2/spatial"

import type { LoadEncounterForWriteError } from "@/lib/db/queries/load-encounter-v2"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

import { encounterMutationBase } from "../encounter/encounter-mutation.schema"

/**
 * Input schema for the v2 {@link applyCombatEventAction} (UNN-520) — the
 * parallel twin of v1's `ApplyCombatEventSchema` over engine-v2's event
 * vocabulary. The envelope composes over {@link combatEventSchema} and so
 * **inherits its `ComponentWriteEvent` exclusion** (CD19): a vitals/durable
 * component write is *unrepresentable on this wire by parse* — it travels only
 * through the write-router's own action.
 *
 * The engine's `addParticipant` arm is placement-blind (position is Instance
 * state, not a session field), so the wire carries its own
 * {@link addParticipantWireSchema} **ahead of** the engine schema in the union:
 * the same roster setup plus the `zoneId` the paired occupancy write needs, and
 * a two-arm entity source — `{ entity }` inline, `{ entityId }` the durable
 * mid-combat joiner (R6.2) the action hydrates from the character row. An
 * engine-shaped (placement-less) add still parses, and the action rejects it
 * with `missing-placement` — one explicit decision point, not a silent default.
 */
const addParticipantWireSetupBase = z.object({
  id: participantIdSchema.optional(),
  side: z.enum(COMBAT_SIDES),
  zoneId: z.string().min(1),
})

const addParticipantWireSchema = z.object({
  kind: z.literal("addParticipant"),
  setup: z.union([
    addParticipantWireSetupBase.extend({ entity: storedEntitySchema }),
    addParticipantWireSetupBase.extend({ entityId: z.string().min(1) }),
  ]),
})

export type AddParticipantWireEvent = z.infer<typeof addParticipantWireSchema>

export const ApplyCombatEventSchema = encounterMutationBase.extend({
  expectedInstanceVersion: z.number().int().nonnegative().optional(),
  event: z.union([
    addParticipantWireSchema,
    combatEventSchema,
    mapInstanceEventSchema,
  ]),
})

export type ApplyCombatEventInput = z.input<typeof ApplyCombatEventSchema>

/**
 * The v1 error surface carried over (single-live guard, placement enforcement,
 * missing Instance token, write staleness) plus the v2 loader's data-integrity
 * codes and the wire-specific rejections: `missing-placement` (an add with no
 * zone), `character-not-found` / `invalid-entity` (a joiner that fails to
 * hydrate), and `locator-missing` (the fail-closed saver refused — a durable
 * joiner was minted without registering its home; a programmer bug surfaced,
 * never silently inlined).
 */
export type ApplyCombatEventError =
  | "invalid-input"
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"
  | "missing-instance-version"
  | "missing-placement"
  | "character-not-found"
  | "invalid-entity"
  | "locator-missing"
  | LoadEncounterForWriteError
  | EncounterWriteError
  | MapInstanceWriteError
