import { combatantName } from "@workspace/game/engine/encounter/console-view"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import type { EngageableTarget } from "@workspace/game/engine/encounter/setup-roster-view"
import type {
  Combatant,
  CombatSession,
  Engagement,
} from "@workspace/game/foundation/encounter/session"

/**
 * A combatant's engagement for the drawer control (UNN-316): the raw value (for
 * the {@link import("./setup-roster-view").EngageableTarget}-driven control), the
 * current targets resolved to display names ("Engaged with …"), and the
 * **candidates** it may engage — other combatants in the **same zone**
 * (rulebook §3.5; same-zone is plain `zoneId` equality, so an unzoned encounter
 * offers everyone — matching UNN-301), **plus any current targets** so an
 * existing engagement is always clearable even if a move (UNN-315 doesn't couple
 * engagement to position) left a partner in another zone. The DM control guides
 * to these; the reducer stays permissive.
 */
export interface CombatantEngagement {
  value: Engagement
  targetNames: string[]
  candidates: EngageableTarget[]
}

/**
 * Shapes a {@link CombatantEngagement} for one combatant. Names resolve through
 * the existing {@link combatantName}; the candidate list is every *other*
 * combatant sharing this one's `zoneId`. Pure — recomputed on every optimistic
 * session change so the drawer reflects a set/clear immediately.
 */
export function resolveCombatantEngagement(
  session: CombatSession,
  combatant: Combatant,
  pcDetailById: Record<string, PcCombatantDetail>
): CombatantEngagement {
  const value = combatant.engagement
  const nameById = new Map(
    session.combatants.map((c) => [c.id, combatantName(c, pcDetailById)])
  )

  const engagedIds =
    value.status === "engaged" ? new Set(value.targetCombatantIds) : new Set()

  const targetNames =
    value.status === "engaged"
      ? value.targetCombatantIds.map((id) => nameById.get(id) ?? id)
      : []

  const candidates = session.combatants.flatMap((other) =>
    other.id === combatant.id ||
    (other.zoneId !== combatant.zoneId && !engagedIds.has(other.id))
      ? []
      : [{ id: other.id, label: nameById.get(other.id) ?? other.id }]
  )

  return { value, targetNames, candidates }
}
