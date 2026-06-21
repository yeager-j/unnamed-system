"use client"

import { type CombatantDetail } from "@workspace/game/engine"
import { type CombatEvent } from "@workspace/game/foundation"

import { ConditionsControls } from "@/components/combat/conditions/controls"
import { DetailSection } from "@/components/shared/detail-section"

/**
 * The drawer's **AILMENT & CONDITIONS** section (UNN-310) — the session-overlay
 * state the DM edits per combatant. A thin {@link DetailSection} wrapper over the
 * shared {@link ConditionsControls}, fed the combatant's overlay fields; every
 * control dispatches a `CombatEvent` through `onCombatEvent`. Identical for PCs
 * and enemies (overlay state, ADR Decision 1), and now identical to the player's
 * own combat-state control (same `ConditionsControls`).
 */
export function CombatantConditionsSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
}) {
  return (
    <DetailSection title="Ailment & conditions">
      <ConditionsControls
        combatantId={detail.id}
        battleConditions={detail.battleConditions}
        conditionDurations={detail.conditionDurations}
        ailments={detail.ailments}
        onCombatEvent={onCombatEvent}
      />
    </DetailSection>
  )
}
