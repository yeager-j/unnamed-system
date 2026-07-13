"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type {
  EntityTimelineDayView,
  EntityTimelineEntryView,
} from "@/domain/planner/view/world-detail"
import { deleteActivityAction } from "@/lib/actions/campaign-updates/activity"

import {
  ActivityComposer,
  type ComposerTarget,
} from "../composer/activity-composer"
import { UpdateEntryCard } from "../composer/update-entry-card"

/**
 * The per-entity timeline (UNN-579, PRD FR-10): every update where this
 * entity is primary or concerned, day-grouped, `(day, authoredAt)` order,
 * each entry the same {@link UpdateEntryCard} the downtime workspace shows —
 * one update stream, one card (D3). **World updates** (slot-less rows) take
 * edit/delete here through the shared composer/actions; slotted activities
 * are display-only (their edits live in the runner, current-day-guarded).
 */
export function EntityTimeline({
  campaignId,
  days,
  linkerOptions,
  editTarget,
}: {
  campaignId: string
  days: EntityTimelineDayView[]
  linkerOptions: LinkerOption[]
  /** The world composer target for inline edits; null pre-clock (display-only). */
  editTarget: ComposerTarget | null
}) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing recorded yet — updates naming this entry gather here.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-4">
      {days.map((day) => (
        <li key={day.day} className="flex flex-col gap-2">
          <div className="font-mono text-xs text-muted-foreground uppercase">
            Day {day.day}
          </div>
          <ol className="flex flex-col gap-2">
            {day.entries.map((entry) => (
              <TimelineEntry
                key={entry.id}
                campaignId={campaignId}
                entry={entry}
                linkerOptions={linkerOptions}
                editTarget={editTarget}
              />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

function TimelineEntry({
  campaignId,
  entry,
  linkerOptions,
  editTarget,
}: {
  campaignId: string
  entry: EntityTimelineEntryView
  linkerOptions: LinkerOption[]
  editTarget: ComposerTarget | null
}) {
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()

  if (editing && editTarget !== null) {
    return (
      <li>
        <ActivityComposer
          campaignId={campaignId}
          target={editTarget}
          linkerOptions={linkerOptions}
          edit={{
            updateId: entry.id,
            body: entry.body,
            category: entry.category,
            concerns: entry.concerns.map((concern) => ({
              kind: concern.ref.kind,
              id: concern.ref.id,
              label: concern.label,
            })),
          }}
          onDone={() => setEditing(false)}
        />
      </li>
    )
  }

  const remove = () =>
    startTransition(async () => {
      const result = await deleteActivityAction({
        campaignId,
        updateId: entry.id,
      })
      if (!result.ok) toast.error("Couldn't delete the update. Try again.")
    })

  const badgeLabel = [
    entry.isWorld ? "World" : "Downtime",
    entry.category ? ACTIVITY_CATEGORY_LABELS[entry.category] : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ")

  return (
    <li>
      <UpdateEntryCard
        badgeLabel={badgeLabel}
        body={entry.body}
        isIdle={entry.category === "idle"}
        pills={entry.others.map((other) => ({
          kind: other.ref.kind,
          id: other.ref.id,
          label: other.label,
          tombstoned: other.tombstoned,
        }))}
        onEdit={
          entry.isWorld && editTarget !== null
            ? () => setEditing(true)
            : undefined
        }
        onDelete={entry.isWorld ? remove : undefined}
      />
    </li>
  )
}
