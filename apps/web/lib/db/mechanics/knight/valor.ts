import { adjustValor } from "../../../game/mechanics"
import { type Result } from "../../../result"
import {
  applyMechanicStateForCharacter,
  type MechanicPersistenceError,
  type MechanicWriteSuccess,
} from "../state"

/**
 * Knight — Valor write wrapper. Composes the pure {@link adjustValor}
 * transition through {@link applyMechanicStateForCharacter}, which owns the
 * `vitalsVersion`-gated cross-table UPDATE. Per-mechanic wrappers stay this
 * small by design: the shared primitive does the load / clamp on the active
 * archetype / conditional bump.
 */
export async function applyAdjustValorForCharacter(
  characterId: string,
  direction: "increment" | "decrement",
  expectedVersion: number
): Promise<Result<MechanicWriteSuccess<"valor">, MechanicPersistenceError>> {
  const delta = direction === "increment" ? 1 : -1
  return applyMechanicStateForCharacter(
    characterId,
    "valor",
    (state) => adjustValor(state, delta),
    expectedVersion
  )
}
