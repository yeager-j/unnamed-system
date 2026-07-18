import { z } from "zod/v4"

import { regionSettingsSchema } from "@workspace/game-v2/generation"

/**
 * Input schema for {@link import("./update-settings").updateRegionSettingsAction}
 * (UNN-589). Edits the Region's authored **defaults** only (D7 — running
 * expeditions keep the values stamped at their mint), so it carries the `name` and
 * the `settings` blob together with the single-`version` optimistic-concurrency
 * token the client round-trips. The seed Map + Template Set bindings are fixed at
 * create and not re-editable here (a rebind would orphan folds).
 */
export const UpdateRegionSettingsSchema = z.object({
  regionId: z.string(),
  expectedVersion: z.number().int().min(0),
  name: z.string().trim().min(1).max(100),
  settings: regionSettingsSchema,
})

export type UpdateRegionSettingsInput = z.input<
  typeof UpdateRegionSettingsSchema
>

export type UpdateRegionSettingsError =
  | "invalid-input"
  | "region-not-found"
  | "stale"
  | "template-set-not-found"
  | "wandering-table-not-found"
