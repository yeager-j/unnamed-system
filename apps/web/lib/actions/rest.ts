"use server"

import { err, type Result } from "@workspace/game/foundation/result"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyFullRestForCharacter,
  applyPartialRestForCharacter,
  applyRespiteForCharacter,
  type RestPersistenceSuccess,
} from "@/lib/db/writes/rest"

import {
  FullRestSchema,
  PartialRestSchema,
  RespiteSchema,
  type FullRestInput,
  type PartialRestInput,
  type RespiteInput,
  type RestActionError,
} from "./rest.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Server Actions for the header-launched Rest dialog (PRD §7.3, UNN-156). All
 * three wrap the vitals-class persistence primitives in `lib/db/writes/rest.ts`.
 * Auth is `requireOwner` — non-owners get `forbidden()`. After a successful
 * write, `revalidateCharacter` re-derives every dependent display value
 * (Vitals bars, Fallen badge, the Dice readout inside the dialog).
 */

export async function fullRestAction(
  input: FullRestInput
): Promise<Result<RestPersistenceSuccess, RestActionError>> {
  const parsed = FullRestSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyFullRestForCharacter(
    character.id,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function partialRestAction(
  input: PartialRestInput
): Promise<Result<RestPersistenceSuccess, RestActionError>> {
  const parsed = PartialRestSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyPartialRestForCharacter(
    character.id,
    {
      skillDiceSpent: parsed.data.skillDiceSpent,
      spRecovered: parsed.data.spRecovered,
    },
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function respiteAction(
  input: RespiteInput
): Promise<Result<RestPersistenceSuccess, RestActionError>> {
  const parsed = RespiteSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyRespiteForCharacter(
    character.id,
    {
      hitDiceSpent: parsed.data.hitDiceSpent,
      hpRecovered: parsed.data.hpRecovered,
    },
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
