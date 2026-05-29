import { z } from "zod/v4"

import type { CastPersistenceError } from "@/lib/db/writes/cast-skill"

/**
 * Input schema for {@link castSkillAction}. The Skill key is the same
 * kebab-case slug the catalog uses; bounding it here keeps a tampered
 * payload from reaching the database. Cast is a vitals-class write — the
 * client sends the {@link characters.vitalsVersion} token it last saw so a
 * concurrent vitals edit surfaces `"stale"` instead of silently overwriting.
 */
export const CastSkillSchema = z.object({
  characterId: z.string().min(1),
  skillKey: z.string().regex(/^[a-z0-9-]+$/),
  expectedVersion: z.number().int().nonnegative(),
})

export type CastSkillInput = z.input<typeof CastSkillSchema>

export type CastSkillActionError = "invalid-input" | CastPersistenceError
