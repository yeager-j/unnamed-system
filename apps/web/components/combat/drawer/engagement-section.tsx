"use client"

import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { MapInstanceEvent } from "@workspace/game-v2/spatial"

import { EngagementControl } from "@/components/combat/controls/engagement"
import { DetailSection } from "@/components/shared/detail-section"
import type { CombatantDetail } from "@/lib/combat/view/detail-view"
import { ENGAGEMENT_STATUS_LABELS } from "@/lib/ui/labels"

/**
 * The drawer's **ENGAGEMENT** section (UNN-316, on v2's spatial vocabulary):
 * the combatant's Free / "Engaged with [names]" status and the control to set
 * or clear it. Reuses the setup {@link EngagementControl} (a popover of
 * candidates — v2's allegiance-gated same-zone set, plus current targets so an
 * existing lock is always clearable) mapped to the `setEngagement` /
 * `clearEngagement` spatial events, keyed by `tokenKey` (the participant id in
 * combat). Engagement is symmetric (the spatial reducer mirrors onto targets).
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
            tokenKey: detail.id,
            targetCombatantIds: engagement.targetCombatantIds,
          }
        : { kind: "clearEngagement", tokenKey: detail.id }
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
