"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyMechanicStateForCharacter,
  type MechanicWriteSuccess,
} from "@/lib/db/writes/mechanic-state"
import { adjustPerfection, resetPerfection } from "@/lib/game/mechanics"
import { err, type Result } from "@/lib/result"

import { revalidateCharacter } from "../../revalidate"
import {
  AdjustPerfectionSchema,
  ResetPerfectionSchema,
  type AdjustPerfectionInput,
  type PerfectionActionError,
  type ResetPerfectionInput,
} from "./perfection.schema"

/**
 * Server Actions for the Warrior — Perfection owner controls (UNN-228).
 * Each: parse → `requireOwner` → compose the pure transition through the
 * shared {@link applyMechanicStateForCharacter} primitive →
 * `revalidateCharacter` on success.
 *
 * No per-mechanic DB wrapper: the shared primitive owns the entire
 * persistence transaction, so an extra file would be a typed alias with
 * nothing left to alias. See `lib/actions/README.md` ("Mechanic writes").
 */

export async function adjustPerfectionAction(
  input: AdjustPerfectionInput
): Promise<Result<MechanicWriteSuccess<"perfection">, PerfectionActionError>> {
  const parsed = AdjustPerfectionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const delta = parsed.data.direction === "increment" ? 1 : -1
  const result = await applyMechanicStateForCharacter(
    character.id,
    "perfection",
    (state) => adjustPerfection(state, delta),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function resetPerfectionAction(
  input: ResetPerfectionInput
): Promise<Result<MechanicWriteSuccess<"perfection">, PerfectionActionError>> {
  const parsed = ResetPerfectionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyMechanicStateForCharacter(
    character.id,
    "perfection",
    resetPerfection,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
