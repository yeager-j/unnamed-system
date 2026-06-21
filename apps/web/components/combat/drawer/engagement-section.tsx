"use client"

import { type CombatantDetail } from "@workspace/game/engine"
import {
  type Engagement,
  type MapInstanceEvent,
} from "@workspace/game/foundation"

import { EngagementControl } from "@/components/combat/controls/engagement"
import { DetailSection } from "@/components/shared/detail-section"
import { ENGAGEMENT_STATUS_LABELS } from "@/lib/ui/labels"

/**
 * The drawer's **ENGAGEMENT** section (UNN-316): the combatant's Free / "Engaged
 * with [names]" status and the control to set or clear it. Reuses the setup
 * {@link EngagementControl} (a popover of same-zone candidates) — its
 * `onChange(Engagement)` is mapped to the live `setEngagement` / `clearEngagement`
 * events, dispatched through the same optimistic `onCombatEvent` path the other
 * drawer controls use. Engagement is symmetric (the reducer mirrors onto the
 * targets); the *who* here is orthogonal to the *where* of POSITION (UNN-315).
 * DM-only is structural (the console route is DM-gated).
 */
export function CombatantEngagementSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: MapInstanceEvent) => void
}) {
  const { value, targetNames, candidates } = detail.engagement

  function onChange(engagement: Engagement) {
    onCombatEvent(
      engagement.status === "engaged"
        ? {
            kind: "setEngagement",
            combatantId: detail.id,
            targetCombatantIds: engagement.targetCombatantIds,
          }
        : { kind: "clearEngagement", combatantId: detail.id }
    )
  }

  if (candidates.length === 0) {
    return (
      <DetailSection title="Engagement">
        <p className="text-sm text-muted-foreground">No one to engage here.</p>
      </DetailSection>
    )
  }

  return (
    <DetailSection title="Engagement">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          {value.status === "engaged" ? (
            <>
              <span className="text-muted-foreground">Engaged with </span>
              {targetNames.join(", ")}
            </>
          ) : (
            <span className="text-muted-foreground">
              {ENGAGEMENT_STATUS_LABELS.free}
            </span>
          )}
        </span>
        <EngagementControl
          value={value}
          options={candidates}
          onChange={onChange}
        />
      </div>
    </DetailSection>
  )
}
