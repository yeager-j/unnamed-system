import { z } from "zod/v4"

import {
  combatEventSchema,
  mapInstanceEventSchema,
} from "@workspace/game/foundation"

import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

import { encounterMutationBase } from "./encounter-mutation.schema"

/**
 * Input schema for {@link applyCombatEvent} (UNN-332 / UNN-459): the shared
 * {@link encounterMutationBase} envelope (encounter id + the encounter
 * optimistic-concurrency token) plus the event — now a union of the session
 * {@link combatEventSchema} **and** the spatial {@link mapInstanceEventSchema},
 * since the cutover split the spatial events onto the Map Instance. The action
 * routes on `isMapInstanceEvent` to the right reducer + row.
 *
 * `expectedInstanceVersion` is the Map Instance's optimistic token — the client
 * holds **both** version tokens (the encounter row and the Instance row) and
 * sends both, because a spatial event guards the Instance and the cross-write
 * `addCombatant`/`removeCombatant` guards both. It is optional so a pure
 * non-spatial session write needn't supply it; the action requires it for the
 * spatial + cross-write paths.
 */
export const ApplyCombatEventSchema = encounterMutationBase.extend({
  expectedInstanceVersion: z.number().int().nonnegative().optional(),
  event: z.union([combatEventSchema, mapInstanceEventSchema]),
})

export type ApplyCombatEventInput = z.input<typeof ApplyCombatEventSchema>

/** A `startCombat` is rejected when the campaign already has a live encounter
 *  (UNN-302's single-live guard) or when zones are defined and any combatant is
 *  unplaced (UNN-347's server-side placement enforcement). The spatial paths add
 *  the Instance write errors and a `missing-instance-version` when the client
 *  omitted the Instance token a spatial/cross-write needs. */
export type ApplyCombatEventError =
  | "invalid-input"
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"
  | "missing-instance-version"
  | EncounterWriteError
  | MapInstanceWriteError
