import { z } from "zod/v4"

import type { CastPersistenceError } from "@/lib/db/writes/cast-skill"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schema for {@link castSkillAction}. The Skill key is the same
 * kebab-case slug the catalog uses; bounding it here keeps a tampered
 * payload from reaching the database. Cast is a vitals-class write — the
 * client sends the {@link characters.vitalsVersion} token it last saw so a
 * concurrent vitals edit surfaces `"stale"` instead of silently overwriting.
 */
export const CastSkillSchema = characterMutationBase.extend({
  skillKey: z.string().regex(/^[a-z0-9-]+$/),
})

export type CastSkillInput = z.input<typeof CastSkillSchema>

export type CastSkillActionError = "invalid-input" | CastPersistenceError
