import type { MechanicKind } from "@workspace/game-v2/kernel/vocab/mechanics"
import type { Mechanics } from "@workspace/game-v2/mechanics/mechanics.schema"
import { getMechanic } from "@workspace/game-v2/mechanics/registry"

/**
 * Order-independent structural equality over two persisted mechanic states — plain
 * JSON values (primitives, arrays, flat objects), so a small recursive walk
 * suffices. Used only to honor the no-op identity contract below.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  )
}

/**
 * The **encounter-end sweep** (D17/D27) — resets every mechanic whose `resetOn` is
 * `"encounter"` to its `initialState()` (Perfection → D, Valor → 0, Frenzy → no
 * Pain, Stains → empty, …), leaving `"rest"` and `"never"` mechanics untouched.
 * The `Mechanics` component is durable-on-entity (D29), so this is an
 * `Entity`-state operation, **not** the combat-overlay clear; the future encounter
 * reducer calls it when combat ends (the call-site v1 declared but never wired).
 *
 * Pure, and **returns the same object reference when nothing changes** — no
 * encounter-reset mechanic carries a non-initial state — so the encounter reducer
 * can skip the write on a no-op (the standard same-ref contract).
 */
export function sweepEncounterEnd(mechanics: Mechanics): Mechanics {
  let changed = false
  const states: Mechanics["states"] = {}

  for (const key of Object.keys(mechanics.states) as MechanicKind[]) {
    const current = mechanics.states[key]
    if (current === undefined) continue

    const definition = getMechanic(key)
    if (definition?.resetOn === "encounter") {
      const initial = definition.initialState()
      states[key] = initial
      if (!deepEqual(initial, current)) changed = true
    } else {
      states[key] = current
    }
  }

  return changed ? { states } : mechanics
}
