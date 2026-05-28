"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyMechanicStateForCharacter,
  type MechanicWriteSuccess,
} from "@/lib/db/mechanics/state"
import { adjustValor } from "@/lib/game/mechanics"
import { err, type Result } from "@/lib/result"

import { revalidateCharacter } from "../../revalidate"
import {
  AdjustValorSchema,
  type AdjustValorError,
  type AdjustValorInput,
} from "./valor.schema"

/**
 * Server Action for the Knight — Valor +/- stepper (UNN-227). Parse →
 * `requireOwner` → compose the pure {@link adjustValor} transition through
 * the shared {@link applyMechanicStateForCharacter} primitive →
 * `revalidateCharacter` on success.
 *
 * No per-mechanic DB wrapper: the shared primitive owns the entire
 * persistence transaction, so an extra file would be a typed alias with
 * nothing left to alias. See `lib/actions/README.md` ("Mechanic writes").
 */
export async function adjustValorAction(
  input: AdjustValorInput
): Promise<Result<MechanicWriteSuccess<"valor">, AdjustValorError>> {
  const parsed = AdjustValorSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const delta = parsed.data.direction === "increment" ? 1 : -1
  const result = await applyMechanicStateForCharacter(
    character.id,
    "valor",
    (state) => adjustValor(state, delta),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
