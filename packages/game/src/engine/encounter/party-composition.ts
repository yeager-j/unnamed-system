import { type Lineage } from "@workspace/game/foundation/character/lineage"
import { type PartyComposition } from "@workspace/game/foundation/character/state"
import {
  COMBAT_SIDES,
  type CombatSession,
  type CombatSide,
} from "@workspace/game/foundation/encounter/session"

/**
 * Derives the {@link PartyComposition} for one {@link CombatSide} from the live
 * session roster — the encounter-scoped input the `perPartyLineage` Attack-Roll
 * scaler (Magic Circle / Ailment Boost) needs but that no longer lives on the
 * character row (UNN-334). Counts each `pc`-ref combatant on `side` by its
 * Lineage, **including the character itself** (the rule counts allies present in
 * the encounter, the caster among them).
 *
 * A PC's Lineage isn't on the session (it's its active Archetype's `lineage`),
 * so it's resolved at the assembly boundary and injected as
 * `lineageByCharacterId` — the boundary-resolution peer of the `pcDetailById` /
 * `enemyStatblockById` maps the other encounter shapers take (UNN-354). A PC
 * with no resolvable Lineage (no active Archetype) is skipped. The result is
 * sparse, keyed over `LINEAGES`, mirroring `partyCompositionSchema`.
 */
export function derivePartyComposition(
  session: CombatSession,
  side: CombatSide,
  lineageByCharacterId: Record<string, Lineage>
): PartyComposition {
  const composition: PartyComposition = {}
  for (const combatant of session.combatants) {
    if (combatant.side !== side) continue
    if (combatant.ref.kind !== "pc") continue
    const lineage = lineageByCharacterId[combatant.ref.characterId]
    if (!lineage) continue
    composition[lineage] = (composition[lineage] ?? 0) + 1
  }
  return composition
}

/**
 * The per-side {@link PartyComposition} map — {@link derivePartyComposition} for
 * every {@link CombatSide}, so a caller deriving a combatant's sheet can index by
 * the combatant's own `side` rather than re-deriving per PC.
 */
export function derivePartyCompositionBySide(
  session: CombatSession,
  lineageByCharacterId: Record<string, Lineage>
): Record<CombatSide, PartyComposition> {
  return Object.fromEntries(
    COMBAT_SIDES.map((side) => [
      side,
      derivePartyComposition(session, side, lineageByCharacterId),
    ])
  ) as Record<CombatSide, PartyComposition>
}
