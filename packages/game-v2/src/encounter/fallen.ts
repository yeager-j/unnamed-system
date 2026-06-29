import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { isFallen } from "@workspace/game-v2/vitals/operations"

import type { ResolvedSession } from "./participant-view"

/**
 * The Fallen-participant set the turn selectors take as their injected `fallenIds`
 * (CD9b). Fallen is **never stored** — it is vitals-derived and recomputed fresh
 * each read, so a revive (HP back above 0) re-enables a participant with **no
 * event**.
 *
 * **The F1 kill (CD9b):** v1 resolved each combatant's HP through a three-arm
 * `ref.kind` switch (PC from an injected map, enemy/catalog from inline state).
 * Because `resolveSession` (UNN-525) resolved every participant uniformly and resolve
 * (D30) derives `vitals.currentHP` for every entity that carries the Vitals
 * capability, the set is one uniform read over the view:
 *
 * - A participant whose entity resolves **no** `vitals` read-unit (no Vitals
 *   capability — an object/hazard) is **not** Fallen — the v2 analogue of v1's
 *   "PC missing from the HP map ⇒ not Fallen" default.
 * - A degenerate entity (e.g. one whose Vitals resolve `maxHP 0`) derives
 *   `currentHP 0` ⇒ Fallen — the resilient fallback that keeps a broken combatant
 *   visible rather than silently dropping it.
 * - Over-max (negative `damage`, `currentHP > maxHP`) is never Fallen — {@link
 *   isFallen} reads the resolved unit.
 */
export function fallenParticipantIds(
  view: ResolvedSession
): Set<ParticipantId> {
  const fallen = new Set<ParticipantId>()
  for (const [id, participantView] of view) {
    const vitals = participantView.components.vitals
    if (vitals === undefined) continue
    if (isFallen(vitals)) fallen.add(id)
  }
  return fallen
}
