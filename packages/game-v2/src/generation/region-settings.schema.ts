import { z } from "zod/v4"

import { randomEncounterIntervalSchema } from "@workspace/game-v2/spatial/dungeon.schema"

/**
 * A **Region**'s authored generation settings (procedural-dungeons tech design D7).
 * These are **authored defaults** — the wandering-monster table the Region designates
 * and its firing cadence — stamped onto **each expedition's dungeon row at mint**, not
 * the runtime truth. Once an expedition starts, the live cadence lives on the
 * `dungeon` row's `reminderSettings` (which the DM may override per run); the Region
 * setting only seeds it. Homing the default here and the runtime value on the dungeon
 * keeps the two lifetimes distinct (D7).
 *
 * `wanderingTableKey` references a content table in the Region's Template Set (P3+
 * resolves it); `wanderingIntervalTurns` reuses the dungeon loop's native
 * {@link randomEncounterIntervalSchema} unit (`1 / 2 / 3 / 6` dungeon turns), so the
 * authored default and the runtime setting speak the same vocabulary. Both optional:
 * a Region need not designate wandering, and an absent field means "no default".
 * `generation → spatial` is the legal seam direction (the reverse is sealed, SD2).
 */
export const regionSettingsSchema = z.object({
  wanderingTableKey: z.string().optional(),
  wanderingIntervalTurns: randomEncounterIntervalSchema.optional(),
})
export type RegionSettings = z.infer<typeof regionSettingsSchema>
