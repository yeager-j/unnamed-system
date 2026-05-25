"use server"

import { eq } from "drizzle-orm"

import { findStepGateFailures } from "@/components/builder/builder-step-gates"
import { requireOwner } from "@/lib/auth/viewer-role"
import { loadCharacterChains } from "@/lib/db/character-chains"
import {
  finalizeCharacter,
  type CharacterFinalizePersistenceSuccess,
} from "@/lib/db/character-finalize"
import { loadCharacterKnives } from "@/lib/db/character-knives"
import { db } from "@/lib/db/index"
import { characterArchetypes } from "@/lib/db/schema/character"
import { err, ok, type Result } from "@/lib/game/result"

import {
  FinalizeCharacterSchema,
  type FinalizeCharacterError,
  type FinalizeCharacterInput,
} from "./character-finalize.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Flips a draft character to `finalized` after re-running every wizard-step
 * gate server-side (PRD §5.2). The Review screen renders the same failures
 * client-side so the player is never surprised by a disabled button, but
 * this server check is the canonical gate — it never trusts the wire.
 *
 * Success returns the public `shortId` so the client can `router.push` to
 * the new sheet at `/c/{shortId}`. Failures preserve the draft (the
 * persistence wrapper's transaction rolls back any partial state).
 */
export async function finalizeCharacterAction(
  input: FinalizeCharacterInput
): Promise<
  Result<CharacterFinalizePersistenceSuccess, FinalizeCharacterError>
> {
  const parsed = FinalizeCharacterSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const [knives, chains, archetypeRow] = await Promise.all([
    loadCharacterKnives(character.id),
    loadCharacterChains(character.id),
    character.activeArchetypeId
      ? db
          .select({ archetypeKey: characterArchetypes.archetypeKey })
          .from(characterArchetypes)
          .where(eq(characterArchetypes.id, character.activeArchetypeId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ])

  const failures = findStepGateFailures({
    name: character.name,
    originArchetypeKey: archetypeRow?.archetypeKey ?? null,
    virtueExpression: character.virtueExpression,
    virtueEmpathy: character.virtueEmpathy,
    virtueWisdom: character.virtueWisdom,
    virtueFocus: character.virtueFocus,
    knives,
    chains,
    personalityTraits: character.personalityTraits,
    hopes: character.hopes,
    dreams: character.dreams,
    fears: character.fears,
    secrets: character.secrets,
  })

  const firstFailure = failures[0]
  if (firstFailure) {
    return err({
      kind: "missing-requirement",
      stepSlug: firstFailure.stepSlug,
      reason: firstFailure.reason,
    })
  }

  const result = await finalizeCharacter(
    character.id,
    parsed.data.expectedVersion
  )

  if (result.ok) {
    revalidateCharacter({
      shortId: character.shortId,
      status: "finalized",
    })
    return ok(result.value)
  }

  return result
}
