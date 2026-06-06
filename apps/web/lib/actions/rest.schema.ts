import { z } from "zod/v4"

import {
  partialRestInputSchema,
  respiteInputSchema,
} from "@workspace/game/engine/combat/rest"

import type { RestPersistenceError } from "@/lib/db/writes/rest"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the header-launched Rest dialog (PRD §7.3, UNN-156).
 * Full / Partial / Respite are all vitals-class writes, so the client sends
 * the {@link characters.vitalsVersion} token it last saw. The Partial and
 * Respite payloads reuse the engine-side Zod schemas — same validation
 * surface the pure transitions check (`skillDiceSpent`/`spRecovered` for
 * Partial, `hitDiceSpent`/`hpRecovered` for Respite, both non-negative
 * integers). The engine still enforces the domain rule that dice spent
 * cannot exceed those unspent and surfaces `insufficient-*-dice` on
 * violation.
 */

export const FullRestSchema = characterMutationBase
export type FullRestInput = z.input<typeof FullRestSchema>

export const PartialRestSchema = characterMutationBase.extend(
  partialRestInputSchema.shape
)
export type PartialRestInput = z.input<typeof PartialRestSchema>

export const RespiteSchema = characterMutationBase.extend(
  respiteInputSchema.shape
)
export type RespiteInput = z.input<typeof RespiteSchema>

export type RestActionError = "invalid-input" | RestPersistenceError
