import { z } from "zod/v4"

import type { FinalizeRefusal } from "@/domain/entity/finalize"
import type { EntityGuardError } from "@/lib/actions/entity/version-guard"

import { entityMutationBase } from "./entity-mutation.schema"

export const FinalizeEntitySchema = entityMutationBase

export type FinalizeEntityInput = z.input<typeof FinalizeEntitySchema>

export type FinalizeEntityError =
  | "invalid-input"
  | "entity-load-failed"
  | FinalizeRefusal
  | EntityGuardError
