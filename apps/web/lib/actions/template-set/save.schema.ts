import { z } from "zod/v4"

import { templateSetContentSchema } from "@workspace/game-v2/generation"

/**
 * Input schema for {@link import("./save").saveTemplateSetAction} (UNN-588) — the
 * autosave write (no Save button). The `patch` is a discriminated union over the
 * field being saved: the **name** arm is the editor header's set-name input; the
 * **content** arm is the write every template/table/knob edit calls with the
 * whole re-derived blob. Each arm is a field-scoped LWW command; concurrency
 * policy stays at the authority instead of traveling as a client version token.
 */
export const SaveTemplateSetSchema = z.object({
  templateSetId: z.string(),
  patch: z.discriminatedUnion("field", [
    z.object({
      field: z.literal("name"),
      name: z.string().trim().min(1).max(100),
    }),
    z.object({
      field: z.literal("content"),
      content: templateSetContentSchema,
    }),
  ]),
})

export type SaveTemplateSetInput = z.input<typeof SaveTemplateSetSchema>

export type SaveTemplateSetError = "invalid-input" | "template-set-not-found"
