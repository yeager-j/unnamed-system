import { z } from "zod/v4"

import { PATH_CHOICES } from "@workspace/game-v2/kernel/vocab"

/**
 * The **Path** component — a PC's permanent HP/SP growth path (the scaling curve
 * `resolve` reads alongside {@link import("./level.schema").Level} to fold the
 * path/level maxHP/maxSP layer). Presence is **PC-only** (D37): an enemy's HP/SP is
 * its authored `base`, with no path layer, so it carries no Path; a shapechanged
 * entity drops Path too (the form's `base` is the absolute max).
 *
 * Split out of the old `Progression` component — `level` is universal but the path
 * is not, so bundling them forced an enemy to either fake a `pathChoice` or forgo a
 * Level it needs for Insta-Kill.
 */
export const pathSchema = z.object({
  choice: z.enum(PATH_CHOICES),
})

export type Path = z.infer<typeof pathSchema>
