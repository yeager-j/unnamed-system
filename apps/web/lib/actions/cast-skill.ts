"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyCastForCharacter,
  type CastPersistenceSuccess,
} from "@/lib/db/writes/cast-skill"

import {
  CastSkillSchema,
  type CastSkillActionError,
  type CastSkillInput,
} from "./cast-skill.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * The engine-touching Server Action for the Combat-tab Cast button
 * (PRD §7.2, UNN-225): flows through the pure {@link applyCast} engine and
 * the vitals-class persistence wrapper. After a successful write,
 * `revalidateCharacter` re-derives every dependent display value (Vitals
 * card, Skill cost badge against new max HP, etc.). See
 * `lib/actions/README.md` for the canonical pattern.
 */
export async function castSkillAction(
  input: CastSkillInput
): Promise<Result<CastPersistenceSuccess, CastSkillActionError>> {
  const parsed = CastSkillSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyCastForCharacter(
    character.id,
    parsed.data.skillKey,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
