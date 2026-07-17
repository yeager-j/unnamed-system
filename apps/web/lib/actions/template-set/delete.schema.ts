import { z } from "zod/v4"

/**
 * Input schema for {@link import("./delete").deleteTemplateSetAction} (UNN-588).
 * Deleting a Set is a **soft delete** (`deletedAt`); a simple confirm dialog
 * suffices — no type-to-confirm.
 */
export const DeleteTemplateSetSchema = z.object({
  templateSetId: z.string(),
})

export type DeleteTemplateSetInput = z.input<typeof DeleteTemplateSetSchema>

export type DeleteTemplateSetError = "invalid-input"
