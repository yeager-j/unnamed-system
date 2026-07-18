import { z } from "zod/v4"

/**
 * Input schema for {@link import("./delete").deleteTemplateSetAction} (UNN-588).
 * Deleting a Set is a **soft delete** (`deletedAt`); a simple confirm dialog
 * suffices — no type-to-confirm. The action refuses when a Region rolls from the
 * set (`template-set-in-use`, UNN-589).
 */
export const DeleteTemplateSetSchema = z.object({
  templateSetId: z.string(),
})

export type DeleteTemplateSetInput = z.input<typeof DeleteTemplateSetSchema>

export type DeleteTemplateSetError = "invalid-input" | "template-set-in-use"
