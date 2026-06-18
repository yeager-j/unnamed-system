import { z } from "zod/v4"

/**
 * Input schema for {@link getDungeonVersionAction} — the dungeon stale-retry read,
 * keyed on the public `shortId` (the console URL), mirroring the encounter
 * `GetEncounterVersionSchema`.
 */
export const GetDungeonVersionSchema = z.object({
  shortId: z.string(),
})

export type GetDungeonVersionInput = z.input<typeof GetDungeonVersionSchema>

export type GetDungeonVersionError = "invalid-input" | "dungeon-not-found"
