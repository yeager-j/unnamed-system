import { z } from "zod/v4"

import type { EntityGuardError } from "@/lib/actions/entity/version-guard"
import type { FinalizeRefusal } from "@/lib/entity/finalize"

import { entityMutationBase } from "./entity-mutation.schema"

export const FinalizeEntitySchema = entityMutationBase

export type FinalizeEntityInput = z.input<typeof FinalizeEntitySchema>

export type FinalizeEntityError =
  | "invalid-input"
  | "entity-load-failed"
  | FinalizeRefusal
  | EntityGuardError
