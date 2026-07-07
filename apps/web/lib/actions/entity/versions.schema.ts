import { z } from "zod/v4"

import { VERSION_CLASSES } from "@/lib/db/version-classes"

/**
 * Input schema for {@link import("./versions").getEntityClassVersionAction} —
 * the per-class token read backing every write queue's one-shot stale-retry
 * (UNN-567). Keyed on the entity row id (the id the write pipeline targets).
 */
export const GetEntityClassVersionSchema = z.object({
  entityId: z.string().min(1),
  versionClass: z.enum(VERSION_CLASSES),
})

export type GetEntityClassVersionInput = z.input<
  typeof GetEntityClassVersionSchema
>

export type GetEntityClassVersionError = "invalid-input"
