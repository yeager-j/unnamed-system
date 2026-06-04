import { produce } from "immer"

import type { CombatSession } from "../session"
import type { EnemyVitalsEvent } from "../session-event"

/**
 * Enemy-vitals slice (UNN-309). `adjustEnemyVitals` sets one field of an enemy
 * combatant's working vitals to an absolute value:
 *
 * - **inline `enemy`** — writes the field on the inline `statBlock` (HP + SP).
 * - **`catalog-enemy`** — writes `currentHP`/`maxHP` inline on the ref (its
 *   immutable identity stays resolved from the definition by `enemyKey`); catalog
 *   enemies have **no SP**, so the SP fields are ignored.
 *
 * A **no-op for a PC** (vitals live on the character row, written through the
 * pools actions) and for an unknown id (Immer returns the original session).
 * Every field is **floored at 0** — overkill can't drive HP negative, matching
 * how the character engine floors PC damage. Mirrors `reduce/conditions.ts`.
 */
export function reduceEnemyVitalsEvent(
  session: CombatSession,
  event: EnemyVitalsEvent
): CombatSession {
  switch (event.kind) {
    case "adjustEnemyVitals":
      return produce(session, (draft) => {
        const ref = draft.combatants.find(
          (entry) => entry.id === event.combatantId
        )?.ref
        if (ref === undefined) return

        const value = Math.max(0, event.value)

        if (ref.kind === "enemy") {
          ref.statBlock[event.field] = value
        } else if (ref.kind === "catalog-enemy") {
          if (event.field === "currentHP") ref.currentHP = value
          else if (event.field === "maxHP") ref.maxHP = value
        }
      })
  }
}
