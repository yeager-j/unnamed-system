"use client"

import type { LinkerOption } from "@/domain/planner/view/linker"
import type { TimelineDayView } from "@/domain/planner/view/timeline"

import type { ComposerTarget } from "../composer/activity-composer"
import { UpdateTimeline } from "../timeline/update-timeline"

/**
 * The per-entity timeline (UNN-579, PRD FR-10): every update where this
 * entity is primary or concerned, rendered through the shared
 * {@link UpdateTimeline} (UNN-580) — one update stream, one look (D3). The
 * page's entity is elided from participant strips (the page is the context),
 * so the primary chip stays off. **World updates** (slot-less rows) take
 * edit/delete here through the shared composer/actions; slotted activities
 * are display-only (their edits live in the runner, current-day-guarded).
 */
export function EntityTimeline({
  campaignId,
  campaignShortId,
  days,
  linkerOptions,
  editTarget,
}: {
  campaignId: string
  campaignShortId: string
  days: TimelineDayView[]
  linkerOptions: LinkerOption[]
  /** The world composer target for inline edits; null pre-clock (display-only). */
  editTarget: ComposerTarget | null
}) {
  return (
    <UpdateTimeline
      campaignId={campaignId}
      campaignShortId={campaignShortId}
      days={days}
      linkerOptions={linkerOptions}
      showPrimaryChip={false}
      policy={{
        editTarget: (entry) =>
          entry.isWorld && editTarget !== null ? editTarget : null,
        canDelete: (entry) => entry.isWorld,
      }}
      emptyMessage="Nothing recorded yet — updates naming this entry gather here."
    />
  )
}
