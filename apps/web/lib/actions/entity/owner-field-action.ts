import type { z } from "zod/v4"

import { err, type Result } from "@workspace/result"

import { requireEntityOwner } from "@/lib/auth/campaign-access"
import type { EntityRow } from "@/lib/db/schema/entity"

interface OwnerFieldInput {
  entityId: string
}

export function makeOwnerFieldAction<
  Input,
  Parsed extends OwnerFieldInput,
  Value,
  Error,
>(
  schema: z.ZodType<Parsed, Input>,
  handler: (row: EntityRow, input: Parsed) => Promise<Result<Value, Error>>
): (input: Input) => Promise<Result<Value, Error | "invalid-input">> {
  return async (input) => {
    const parsed = schema.safeParse(input)
    if (!parsed.success) return err("invalid-input")

    const { entity } = await requireEntityOwner(parsed.data.entityId)
    return handler(entity, parsed.data)
  }
}
