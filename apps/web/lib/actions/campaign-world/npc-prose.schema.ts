import { z } from "zod/v4"

import { NARRATIVE_TEXT_FIELDS } from "@workspace/game-v2/narrative"

/**
 * Input schemas for the NPC prose autosave (D10). Bounds mirror the entity
 * door's narrative arms (`NARRATIVE_TEXT_MAX`); the field enum is the
 * schema-derived `NARRATIVE_TEXT_FIELDS`, so the UI cannot drift from the
 * component.
 */
export const SaveNpcNameSchema = z.object({
  campaignId: z.string(),
  entityId: z.string(),
  name: z.string().max(200),
  /** Set on the terminal (blur/unmount) save so the world route is revalidated — see the action. */
  revalidate: z.boolean().optional(),
})

export const SaveNpcNarrativeSchema = z.object({
  campaignId: z.string(),
  entityId: z.string(),
  field: z.enum(NARRATIVE_TEXT_FIELDS),
  value: z.string().max(8000),
  /** Set on the terminal (blur/unmount) save so the world route is revalidated — see the action. */
  revalidate: z.boolean().optional(),
})

export type SaveNpcNameInput = z.input<typeof SaveNpcNameSchema>
export type SaveNpcNarrativeInput = z.input<typeof SaveNpcNarrativeSchema>

export type NpcProseError = "invalid-input" | "npc-not-found"
