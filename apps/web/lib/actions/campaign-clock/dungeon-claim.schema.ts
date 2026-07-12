import { z } from "zod/v4"

export const ClaimDungeonSlotSchema = z.object({
  campaignId: z.string(),
  slotId: z.string(),
  dungeonId: z.string(),
})
export type ClaimDungeonSlotInput = z.input<typeof ClaimDungeonSlotSchema>

export const UnclaimDungeonSlotSchema = z.object({
  campaignId: z.string(),
  slotId: z.string(),
})
export type UnclaimDungeonSlotInput = z.input<typeof UnclaimDungeonSlotSchema>

export const SetDungeonSlotResolvedSchema = z.object({
  campaignId: z.string(),
  slotId: z.string(),
  resolved: z.boolean(),
})
export type SetDungeonSlotResolvedInput = z.input<
  typeof SetDungeonSlotResolvedSchema
>

export type DungeonClaimActionError =
  | "invalid-input"
  | "clock-not-found"
  | "slot-not-found"
  | "dungeon-not-found"
  | "claim-not-found"
  | "frozen-day"
  | "slot-occupied"
