import { produce } from "immer"

import { getEnemy } from "@workspace/game/data/enemies/registry"
import type { CombatSession } from "@workspace/game/foundation/encounter/session"
import type { EnemyVitalsEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Enemy-vitals slice (UNN-309). `adjustEnemyVitals` sets one field of an enemy
 * combatant's working vitals to an absolute value:
 *
 * - **inline `enemy`** — writes the field on the inline `statBlock` (HP + SP).
 * - **`catalog-enemy`** — writes `currentHP`/`maxHP` inline on the ref (its
 *   immutable identity stays resolved from the definition by `enemyKey`, and its
 *   working HP defaults to that definition's `maxHP` until first set); catalog
 *   enemies have **no SP**, so the SP fields are ignored.
 *
 * Lowering a **max** drags its current down with it (`current = min(current,
 * newMax)`) — you can't be at 16/0. Every field is **floored at 0**; overkill
 * can't drive HP negative, matching how the character engine floors PC damage.
 * A **no-op for a PC** (vitals live on the character row, written through the
 * pools actions) and for an unknown id (Immer returns the original session).
 * Mirrors `reduce/conditions.ts`.
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
          const statBlock = ref.statBlock
          switch (event.field) {
            case "currentHP":
              statBlock.currentHP = value
              break
            case "currentSP":
              statBlock.currentSP = value
              break
            case "maxHP":
              statBlock.maxHP = value
              statBlock.currentHP = Math.min(statBlock.currentHP, value)
              break
            case "maxSP":
              statBlock.maxSP = value
              statBlock.currentSP = Math.min(statBlock.currentSP, value)
              break
          }
        } else if (ref.kind === "catalog-enemy") {
          // Catalog enemies carry only working HP (no SP); current defaults to
          // the definition's max until first set.
          if (event.field === "currentHP") {
            ref.currentHP = value
          } else if (event.field === "maxHP") {
            const definitionMax = getEnemy(ref.enemyKey)?.maxHP ?? 0
            const current = ref.currentHP ?? definitionMax
            ref.maxHP = value
            ref.currentHP = Math.min(current, value)
          }
        }
      })
  }
}
