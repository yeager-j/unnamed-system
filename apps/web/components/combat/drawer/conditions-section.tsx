"use client"

import type {
  AilmentEvent,
  Ailments,
  BattleConditionEvent,
  BattleConditions,
  ConditionDurations,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { ConditionsControls } from "@/components/combat/conditions/controls"
import { DetailSection } from "@/components/shared/detail-section"

/**
 * The drawer's **AILMENT & CONDITIONS** section (UNN-310) — the session-overlay
 * state the DM edits per combatant. A thin {@link DetailSection} wrapper over
 * the shared {@link ConditionsControls}, fed the combatant's overlay fields;
 * every control dispatches a v2 `CombatEvent` through `onCombatEvent`.
 * Identical for every participant (overlay state is uniform).
 */
export function CombatantConditionsSection({
  participantId,
  ailments,
  battleConditions,
  conditionDurations,
  onCombatEvent,
}: {
  participantId: ParticipantId
  ailments: Ailments
  battleConditions: BattleConditions
  conditionDurations: ConditionDurations
  onCombatEvent: (event: AilmentEvent | BattleConditionEvent) => void
}) {
  return (
    <DetailSection title="Ailment & conditions">
      <ConditionsControls
        participantId={participantId}
        battleConditions={battleConditions}
        conditionDurations={conditionDurations}
        ailments={ailments}
        onCombatEvent={onCombatEvent}
      />
    </DetailSection>
  )
}
