import type { Entity } from "@workspace/game-v2/kernel/entity"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"
import type {
  AttributeScores,
  PartialAffinityChart,
} from "@workspace/game-v2/kernel/vocab"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

interface EnemyTemplateInput {
  key: string
  name: string
  level: number
  maxHP: number
  attributes: AttributeScores
  affinities: PartialAffinityChart
  skillKeys?: readonly string[]
  inlineSkills?: readonly Skill[]
  talents?: readonly string[]
}

/**
 * Authoring helper for catalog enemy templates. It returns a plain authored
 * Entity, not a separate EnemyDefinition runtime shape.
 */
export function defineEnemy(input: EnemyTemplateInput): Entity {
  const result = loadEntity(input.key, {
    identity: { name: input.name },
    level: { value: input.level },
    attributes: { base: input.attributes },
    affinities: { base: input.affinities },
    vitals: { base: input.maxHP, damage: 0 },
    skills: [
      ...(input.skillKeys ?? []).map((key) => ({ kind: "ref" as const, key })),
      ...(input.inlineSkills ?? []).map((skill) => ({
        kind: "inline" as const,
        skill,
      })),
    ],
    talents: (input.talents ?? []).map((key) => ({ key })),
  })

  if (!result.ok) {
    throw new Error(`Invalid enemy template "${input.key}"`)
  }

  return result.value
}
