import { z } from "zod/v4"

import { skillSchema } from "@workspace/game-v2/skills/skill.schema"

/**
 * The direct, entity-authored Skills component: a list of catalog refs and/or
 * inline Skills carried by the entity itself (enemies, NPCs, summons, objects).
 * Archetype kit/inheritance skills remain a separate derived display concern.
 */
export const skillRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ref"), key: z.string().min(1) }),
  z.object({ kind: z.literal("inline"), skill: skillSchema }),
])

export const skillsSchema = z.array(skillRefSchema)

export type SkillRef = z.infer<typeof skillRefSchema>
export type Skills = z.infer<typeof skillsSchema>
