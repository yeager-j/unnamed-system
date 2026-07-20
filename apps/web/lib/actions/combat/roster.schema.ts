import { z } from "zod/v4"

import { storedEntitySchema } from "@workspace/game-v2/encounter"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import { COMBAT_SIDES } from "@workspace/game-v2/kernel/vocab/combat"

import type { LoadEncounterSessionError } from "@/lib/db/queries/load-encounter-session"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * The command-owned roster changes (UNN-657): placed inline add (occupancy
 * pairing), durable add (server hydration, placed or unplaced), and remove
 * (paired occupancy sever). Semantic args only — no client `expectedVersion`;
 * the authority locks Instance → encounter and validates in-transaction.
 *
 * The participant `id` is REQUIRED and client-minted: it is the command's
 * natural idempotency key — a redelivered add whose id is already on the
 * locked roster no-ops, and a redelivered remove of an absent id no-ops.
 *
 * The inline arm requires `zoneId`: a zone-less inline add is single-root
 * replayable intent and travels through the Encounter Replica's
 * `encounter.addInlineParticipants` mutation, never this command.
 */
const addParticipantSetupBase = z.object({
  id: participantIdSchema,
  side: z.enum(COMBAT_SIDES),
})

export const AddParticipantSchema = z.object({
  encounterId: z.string().min(1),
  setup: z.union([
    addParticipantSetupBase.extend({
      entityId: z.string().min(1),
      zoneId: z.string().min(1).optional(),
    }),
    addParticipantSetupBase.extend({
      entity: storedEntitySchema,
      zoneId: z.string().min(1),
    }),
  ]),
})

export type AddParticipantInput = z.input<typeof AddParticipantSchema>

export const RemoveParticipantSchema = z.object({
  encounterId: z.string().min(1),
  participantId: participantIdSchema,
})

export type RemoveParticipantInput = z.input<typeof RemoveParticipantSchema>

/**
 * The command's success envelope: the committed (or, for an idempotent no-op,
 * current) encounter version, plus the Instance version when the command
 * touched occupancy. Versions are invalidation-payload facts, not client
 * concurrency tokens.
 */
export interface AppliedRosterChange {
  version: number
  instanceVersion?: number
}

export type RosterCommandError =
  | "invalid-input"
  | "encounter-ended"
  | "character-not-found"
  | "invalid-entity"
  | "locator-missing"
  | LoadEncounterSessionError
  | EncounterWriteError
  | MapInstanceWriteError
