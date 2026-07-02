"use client"

import type {
  AilmentEvent,
  BattleConditionEvent,
} from "@workspace/game-v2/encounter"

import { ConditionsControls } from "@/components/combat/conditions/controls"
import { DetailSection } from "@/components/shared/detail-section"
import type { CombatantDetail } from "@/lib/combat/view/detail-view"

/**
 * The drawer's **AILMENT & CONDITIONS** section (UNN-310) — the session-overlay
 * state the DM edits per combatant. A thin {@link DetailSection} wrapper over
 * the shared {@link ConditionsControls}, fed the combatant's overlay fields;
 * every control dispatches a v2 `CombatEvent` through `onCombatEvent`.
 * Identical for every participant (overlay state is uniform).
 */
export function CombatantConditionsSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: AilmentEvent | BattleConditionEvent) => void
}) {
  return (
    <DetailSection title="Ailment & conditions">
      <ConditionsControls
        participantId={detail.id}
        battleConditions={detail.battleConditions}
        conditionDurations={detail.conditionDurations}
        ailments={detail.ailments}
        onCombatEvent={onCombatEvent}
      />
    </DetailSection>
  )
}
