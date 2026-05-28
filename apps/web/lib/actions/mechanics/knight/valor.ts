"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import { applyAdjustValorForCharacter } from "@/lib/db/mechanics/knight/valor"
import type { MechanicWriteSuccess } from "@/lib/db/mechanics/state"
import { err, type Result } from "@/lib/result"

import { revalidateCharacter } from "../../revalidate"
import {
  AdjustValorSchema,
  type AdjustValorError,
  type AdjustValorInput,
} from "./valor.schema"

/**
 * Server Action for the Knight — Valor +/- stepper (UNN-227). Parse →
 * `requireOwner` (non-owners get HTTP 403 via `forbidden()`) → DB wrapper
 * → `revalidateCharacter` on success. Mirrors the
 * `lib/actions/combat-state.ts` shape exactly so every future mechanic
 * action reads the same way.
 */
export async function adjustValorAction(
  input: AdjustValorInput
): Promise<Result<MechanicWriteSuccess<"valor">, AdjustValorError>> {
  const parsed = AdjustValorSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyAdjustValorForCharacter(
    character.id,
    parsed.data.direction,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
