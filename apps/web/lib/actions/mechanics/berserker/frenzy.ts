"use server"

import { adjustPain, setFrenzyMode } from "@workspace/game/engine"
import { err, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyMechanicStateForCharacter,
  type MechanicWriteSuccess,
} from "@/lib/db/writes/mechanic-state"

import { revalidateCharacter } from "../../revalidate"
import {
  AdjustPainSchema,
  SetFrenzyModeSchema,
  type AdjustPainError,
  type AdjustPainInput,
  type SetFrenzyModeError,
  type SetFrenzyModeInput,
} from "./frenzy.schema"

/**
 * Server Action for the Berserker — Frenzy Pain +/- stepper. Parse →
 * `requireOwner` → compose the pure {@link adjustPain} transition through the
 * shared {@link applyMechanicStateForCharacter} primitive →
 * `revalidateCharacter` on success. No per-mechanic DB wrapper: the shared
 * primitive owns the entire persistence transaction. See
 * `lib/actions/README.md` ("Mechanic writes").
 */
export async function adjustPainAction(
  input: AdjustPainInput
): Promise<Result<MechanicWriteSuccess<"frenzy">, AdjustPainError>> {
  const parsed = AdjustPainSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const delta = parsed.data.direction === "increment" ? 1 : -1
  const result = await applyMechanicStateForCharacter(
    character.id,
    "frenzy",
    (state) => adjustPain(state, delta),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/**
 * Server Action for the Berserker — Frenzy Mode toggle. Parse → `requireOwner`
 * → compose the pure {@link setFrenzyMode} transition through the shared
 * {@link applyMechanicStateForCharacter} primitive → `revalidateCharacter` on
 * success.
 */
export async function setFrenzyModeAction(
  input: SetFrenzyModeInput
): Promise<Result<MechanicWriteSuccess<"frenzy">, SetFrenzyModeError>> {
  const parsed = SetFrenzyModeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyMechanicStateForCharacter(
    character.id,
    "frenzy",
    (state) => setFrenzyMode(state, parsed.data.frenzyMode),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
