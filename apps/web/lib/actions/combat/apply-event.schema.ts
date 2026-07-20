import { z } from "zod/v4"

import {
  removeParticipantEventSchema,
  startCombatEventSchema,
  storedEntitySchema,
} from "@workspace/game-v2/encounter"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import { COMBAT_SIDES } from "@workspace/game-v2/kernel/vocab/combat"

import type { LoadEncounterSessionError } from "@/lib/db/queries/load-encounter-session"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

import { encounterMutationBase } from "../encounter/encounter-mutation.schema"

/**
 * Command-only input schema for {@link applyCombatEventAction}. UNN-656 removes
 * ordinary session intent from this boundary; it accepts only start/add/remove.
 *
 * The engine's `addParticipant` arm is placement-blind (position is Instance
 * state, not a session field), so the wire carries its own
 * {@link addParticipantWireSchema} alongside the two engine command schemas:
 * the same roster setup plus the optional `zoneId` the paired occupancy write
 * needs, and a two-arm entity source — `{ entity }` inline, `{ entityId }` the
 * durable mid-combat joiner (R6.2) the action hydrates from the character row.
 * A zone-less add is the setup console's add-then-place flow (UNN-535): the
 * joiner enters the roster with **no** occupancy token, a later
 * `placeCombatant` spatial event mints it, and `startCombat`'s
 * `isRosterFullyPlaced` gate keeps an unplaced participant out of a zoned
 * fight.
 */
const addParticipantWireSetupBase = z.object({
  id: participantIdSchema.optional(),
  side: z.enum(COMBAT_SIDES),
  zoneId: z.string().min(1).optional(),
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
  event: z.union([
    addParticipantWireSchema,
    startCombatEventSchema,
    removeParticipantEventSchema,
  ]),
})

export type ApplyCombatEventInput = z.input<typeof ApplyCombatEventSchema>

/**
 * The action's success envelope: the bumped version of the row the event's
 * queue owns, plus — for the paired roster cross-writes — the bumped Instance
 * version, so the client folds the real token instead of hand-advancing by one
 * (UNN-567). A session-only write omits it; a pure-spatial write's `version`
 * IS the Instance version.
 */
export interface AppliedCombatEvent {
  version: number
  instanceVersion?: number
}

/**
 * The v1 error surface carried over (single-live guard, placement enforcement,
 * write staleness) plus the v2 loader's data-integrity
 * codes and the wire-specific rejections: `character-not-found` /
 * `invalid-entity` (a joiner that fails to hydrate), and `locator-missing`
 * (the fail-closed saver refused — a durable joiner was minted without
 * registering its home; a programmer bug surfaced, never silently inlined).
 */
export type ApplyCombatEventError =
  | "invalid-input"
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"
  | "character-not-found"
  | "invalid-entity"
  | "locator-missing"
  | LoadEncounterSessionError
  | EncounterWriteError
  | MapInstanceWriteError
