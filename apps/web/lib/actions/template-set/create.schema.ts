import { z } from "zod/v4"

/**
 * Input schema for {@link import("./create").createTemplateSetAction} (UNN-588). A
 * Set needs a name up front; the content starts as the empty set and is autosaved
 * by the editor. The owner is the signed-in caller, not an input field, and the
 * `shortId` is minted server-side — so neither is accepted here.
 */
export const CreateTemplateSetSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

export type CreateTemplateSetInput = z.input<typeof CreateTemplateSetSchema>

export type CreateTemplateSetError = "invalid-input"
