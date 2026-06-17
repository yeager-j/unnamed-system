import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { combatantName } from "@workspace/game/engine/encounter/console-view"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import type { EngageableTarget } from "@workspace/game/engine/encounter/setup-roster-view"
import { type Engagement } from "@workspace/game/foundation/combat/engagement"
import { type MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import type {
  Combatant,
  CombatSession,
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
  instance: MapInstanceState,
  combatant: Combatant,
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): CombatantEngagement {
  const value: Engagement = instance.occupancy[combatant.id]?.engagement ?? {
    status: "free",
  }
  const selfZoneId = instance.occupancy[combatant.id]?.zoneId ?? ""
  const nameById = new Map(
    session.combatants.map((c) => [
      c.id,
      combatantName(c, pcDetailById, enemyStatblockById),
    ])
  )

  const engagedIds =
    // Stryker disable next-line ConditionalExpression: equivalent — a Free engagement carries no `targetCombatantIds`, so the forced-`engaged` branch builds `new Set(undefined)`, which is an empty Set — the same as the `: new Set()` fallback.
    value.status === "engaged" ? new Set(value.targetCombatantIds) : new Set()

  const targetNames =
    value.status === "engaged"
      ? value.targetCombatantIds.map((id) => nameById.get(id) ?? id)
      : []

  const candidates = session.combatants.flatMap((other) => {
    const otherZoneId = instance.occupancy[other.id]?.zoneId ?? ""
    return other.id === combatant.id ||
      (otherZoneId !== selfZoneId && !engagedIds.has(other.id))
      ? []
      : [{ id: other.id, label: nameById.get(other.id) ?? other.id }]
  })

  return { value, targetNames, candidates }
}
