import { z } from "zod/v4"

import { entityWriteSchema } from "@/domain/entity/commit/write.schema"

import type { EntityWriteError } from "./entity-row-store"

/**
 * The entity door's wire (UNN-551; ADR §2.4) — the envelope every durable
 * component write travels in from a character surface's provider: the entity it
 * targets, the class token the guard checks, and the storage-blind
 * {@link entityWriteSchema} descriptor. No storage field: a character route
 * addresses a durable row by construction, so the pipeline is branchless. The
 * encounter door (`lib/actions/combat/commit`) is the sibling wire for writes that
 * must first resolve a participant's home; both forward durable writes to the same
 * `commitEntityWrite`.
 */
export const ApplyEntityWriteSchema = z.object({
  entityId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  write: entityWriteSchema,
})

export type ApplyEntityWriteInput = z.input<typeof ApplyEntityWriteSchema>

export type ApplyEntityWriteError = "invalid-input" | EntityWriteError
