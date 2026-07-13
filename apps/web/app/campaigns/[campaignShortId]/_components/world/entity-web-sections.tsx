"use client"

import { Separator } from "@workspace/ui/components/separator"

import type { ParticipantRef } from "@/domain/planner/participant"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { TimelineDayView } from "@/domain/planner/view/timeline"
import type { RelationRowView } from "@/domain/planner/view/world-detail"

import {
  ActivityComposer,
  type ComposerTarget,
} from "../composer/activity-composer"
import { EntityTimeline } from "./entity-timeline"
import { RelationsSection } from "./relations-section"

/**
 * The entity page's **world-web lower half** (UNN-579), shared by the
 * Article page's document tail and the NPC page's Overview pane: outgoing
 * relations, the "Referenced in N beats" line (the mention index's read),
 * the composer (clock started only — capture is day-stamped), and the
 * per-entity timeline.
 */
export function EntityWebSections({
  campaignId,
  campaignShortId,
  self,
  selfLabel,
  relations,
  timeline,
  beatMentions,
  currentDay,
  linkerOptions,
}: {
  campaignId: string
  campaignShortId: string
  self: ParticipantRef
  selfLabel: string
  relations: RelationRowView[]
  timeline: TimelineDayView[]
  beatMentions: number
  /** Null before "Start the clock" — hides the composer. */
  currentDay: number | null
  linkerOptions: LinkerOption[]
}) {
  const worldTarget: ComposerTarget | null =
    currentDay === null
      ? null
      : {
          kind: "world",
          primary: { kind: self.kind, id: self.id },
          primaryLabel: selfLabel,
          currentDay,
        }

  return (
    <div className="flex flex-col gap-5">
      <Separator />
      <RelationsSection
        campaignId={campaignId}
        campaignShortId={campaignShortId}
        source={self}
        rows={relations}
        linkerOptions={linkerOptions}
      />
      <p className="text-xs text-muted-foreground">
        {beatMentions === 0
          ? "Referenced in no beats yet."
          : `Referenced in ${beatMentions} beat${beatMentions === 1 ? "" : "s"}.`}
      </p>
      <Separator />
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Timeline</h2>
        {worldTarget !== null ? (
          <ActivityComposer
            campaignId={campaignId}
            target={worldTarget}
            linkerOptions={linkerOptions}
          />
        ) : null}
        <EntityTimeline
          campaignId={campaignId}
          campaignShortId={campaignShortId}
          days={timeline}
          linkerOptions={linkerOptions}
          editTarget={worldTarget}
        />
      </div>
    </div>
  )
}
