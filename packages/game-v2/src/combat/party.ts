import type { Lineage } from "@workspace/game-v2/kernel/vocab/lineage"

/**
 * A side's party composition — the count of PC combatants per Lineage, used by
 * the `perPartyLineage` Attack-Roll scaler (Magic Circle, Ailment Boost). Sparse:
 * a Lineage with no combatants is absent (treated as 0). **Derived from a session**
 * by the encounter layer (`derivePartyComposition`, PR8); the combat resolvers
 * only consume it.
 */
export type PartyComposition = Partial<Record<Lineage, number>>

/**
 * The encounter-scoped context the character-path Attack-Roll resolver needs to
 * resolve a `perPartyLineage` scaler at use time: the casting side's party
 * composition and the caster's active Lineage (for the self-exclusion rule).
 *
 * **Both are injected, not derived inside the resolver.** Their production source
 * is later PRs — `partyComposition` from the session (PR8), `activeLineage` from
 * the resolved-archetypes read-unit (PR6) — so the resolver stays a pure,
 * catalog-free function of resolved read-units + this context. An enemy (or any
 * caller with no party context) passes `null`, collapsing every scaler to 0.
 */
export interface ScalerContext {
  partyComposition: PartyComposition | null
  activeLineage: Lineage | null
}
