import { z } from "zod/v4"

/**
 * Input schema for {@link deleteEntityAction}. `confirmationName` is the value
 * the user typed into the type-to-confirm dialog. Optional because unnamed
 * drafts skip the type-to-confirm step (UNN-219 parity) — the action treats a
 * missing name against an unnamed row as a valid discard; for named rows it
 * enforces the typed-name match so a malformed direct call can't bypass the
 * gate.
 */
export const DeleteEntitySchema = z.object({
  entityId: z.string().min(1),
  confirmationName: z.string().optional(),
})

export type DeleteEntityInput = z.input<typeof DeleteEntitySchema>

export type DeleteEntityError =
  | "invalid-input"
  | "name-mismatch"
  | "entity-not-found"
  | "live-encounter-lock"
