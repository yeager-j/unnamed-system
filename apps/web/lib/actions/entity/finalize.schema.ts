import { z } from "zod/v4"

import type { FinalizeRefusal } from "@/domain/entity/finalize"
import type { EntityGuardError } from "@/lib/actions/entity/version-guard"

/**
 * Finalize carries no expected version since P2d (UNN-676): the action reads
 * the draft's current `identityVersion` inside its own load and guards on that
 * — server-authoritative, like every Store since UNN-674. A draft is
 * single-writer by construction, so a lost race ("stale") means another tab
 * committed between load and guard; the client refreshes rather than retrying.
 */
export const FinalizeEntitySchema = z.object({
  entityId: z.string().min(1),
})

export type FinalizeEntityInput = z.input<typeof FinalizeEntitySchema>

export type FinalizeEntityError =
  | "invalid-input"
  | "entity-load-failed"
  | FinalizeRefusal
  | EntityGuardError
