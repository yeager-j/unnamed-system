"use server"

import { eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game/foundation/result"

import { findStepGateFailures } from "@/components/builder/builder-step-gates"
import { requireOwner } from "@/lib/auth/viewer-role"
import { db } from "@/lib/db"
import { characterArchetypes } from "@/lib/db/schema/character"
import { loadCharacterChains } from "@/lib/db/writes/chains"
import {
  finalizeCharacter,
  type CharacterFinalizePersistenceSuccess,
} from "@/lib/db/writes/finalize"
import { loadCharacterKnives } from "@/lib/db/writes/knives"

import {
  FinalizeCharacterSchema,
  type FinalizeCharacterError,
  type FinalizeCharacterInput,
} from "./character-finalize.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Resolves the active Archetype's catalog key from the pre-loaded rows so
 * the gate check and the persistence call share one `characterArchetypes`
 * read.
 */
function activeArchetypeKey(
  activeArchetypeId: string | null,
  archetypeRows: readonly { id: string; archetypeKey: string }[]
): string | null {
  if (!activeArchetypeId) return null
  return (
    archetypeRows.find((row) => row.id === activeArchetypeId)?.archetypeKey ??
    null
  )
}

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

  const [knives, chains, archetypeRows] = await Promise.all([
    loadCharacterKnives(character.id),
    loadCharacterChains(character.id),
    db
      .select()
      .from(characterArchetypes)
      .where(eq(characterArchetypes.characterId, character.id)),
  ])

  const failures = findStepGateFailures({
    name: character.name,
    originArchetypeKey: activeArchetypeKey(
      character.activeArchetypeId,
      archetypeRows
    ),
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
    character,
    archetypeRows,
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
