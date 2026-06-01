import type { Combatant, CombatSession } from "../session"

/**
 * Replaces the combatant with `combatantId` by `updater(combatant)`, returning a
 * new session; the combatants list is left untouched when no id matches. The
 * immutable single-combatant update that every state-mutating slice in
 * `./reduce/` builds on — the tracker counterpart to the character engine's
 * `patchRow` (`character/reduce/shared.ts`).
 */
export function withCombatant(
  session: CombatSession,
  combatantId: string,
  updater: (combatant: Combatant) => Combatant
): CombatSession {
  return {
    ...session,
    combatants: session.combatants.map((combatant) =>
      combatant.id === combatantId ? updater(combatant) : combatant
    ),
  }
}
