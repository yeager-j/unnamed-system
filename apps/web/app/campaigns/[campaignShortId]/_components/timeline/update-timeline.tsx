"use client"

import { FlagIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { ParticipantPreviewPill } from "@/components/shared/participant-preview"
import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import type { UpdateCategory } from "@/domain/planner/update-category"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type {
  TimelineDayView,
  TimelineEntryView,
} from "@/domain/planner/view/timeline"
import { deleteActivityAction } from "@/lib/actions/campaign-updates/activity"
import { campaignArticlePath } from "@/lib/paths"

import {
  ActivityComposer,
  type ComposerTarget,
} from "../composer/activity-composer"
import { UpdateEntryCard } from "../composer/update-entry-card"
import { TimelineEntryMenu, type BindableDeadline } from "./timeline-entry-menu"

/**
 * What one surface lets the viewer do to a timeline entry. The actions
 * behind every affordance are the shared ones (`editActivityAction`,
 * `deleteActivityAction`, `redateUpdateAction`, the deadline binds), so an
 * edit made here IS the row every other surface shows (D3) — the policy only
 * decides which affordances render.
 */
export interface TimelineEntryPolicy {
  /** Non-null ⇒ the pencil renders; the target seeds the composer's edit mode. */
  editTarget: (entry: TimelineEntryView) => ComposerTarget | null
  canDelete: (entry: TimelineEntryView) => boolean
  /** Re-date lives in the overflow; slotted rows detach on re-date (D3). */
  canRedate?: (entry: TimelineEntryView) => boolean
}

/** The gutter dots: brand anchors (world indigo, virtue gold) + legible hues. */
const CATEGORY_DOT_CLASSES: Record<UpdateCategory, string> = {
  virtue: "bg-gold",
  talent: "bg-sky-400",
  practical: "bg-stone-400",
  collaborator: "bg-emerald-400",
  idle: "bg-muted-foreground/50",
}

/**
 * The shared **timeline** (UNN-580): day-grouped `campaignUpdate` entries in
 * the handoff's gutter treatment — colored dot + connector, entity chip,
 * category badge, prose, concern strip — rendered identically by the entity
 * pages, Day-End Capture's "Logged today", and the Chronicle. Surfaces
 * differ only by their {@link TimelineEntryPolicy} and slots.
 */
export function UpdateTimeline({
  campaignId,
  campaignShortId,
  days,
  linkerOptions,
  policy,
  showPrimaryChip = true,
  showDayHeaders = true,
  currentDay = null,
  bindableDeadlines = [],
  entryFooter,
  emptyMessage = "Nothing recorded yet.",
  onMutated,
}: {
  campaignId: string
  campaignShortId: string
  days: TimelineDayView[]
  linkerOptions: LinkerOption[]
  policy: TimelineEntryPolicy
  /** Off on entity pages — the page is the primary, eliding is the context. */
  showPrimaryChip?: boolean
  /** Off when the surface owns the day context (Day-End's single day). */
  showDayHeaders?: boolean
  /** The re-date dialog's upper bound; re-date hides without it. */
  currentDay?: number | null
  /** Live unresolved deadlines — enables "Resolves a deadline" on world rows. */
  bindableDeadlines?: BindableDeadline[]
  /** Rendered under an entry's card (the phase-8 bond-confirm slot). */
  entryFooter?: (entry: TimelineEntryView) => React.ReactNode
  emptyMessage?: string
  /**
   * Fires after any successful mutation on an entry (edit/delete/re-date/
   * bind). Surfaces holding client-fetched pages (the Chronicle feed) replay
   * them here; RSC-fed surfaces don't need it — revalidation refreshes them.
   */
  onMutated?: () => void
}) {
  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ol className="flex flex-col gap-5">
      {days.map((day) => (
        <li key={day.day} id={`day-${day.day}`} className="flex flex-col gap-1">
          {showDayHeaders ? (
            <div className="flex items-baseline justify-between border-b pb-1.5">
              <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                Day {day.day}
              </span>
              {day.seasonLabel !== null ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {day.seasonLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          <ol>
            {day.entries.map((entry) => (
              <TimelineRow
                key={entry.id}
                campaignId={campaignId}
                campaignShortId={campaignShortId}
                entry={entry}
                linkerOptions={linkerOptions}
                policy={policy}
                showPrimaryChip={showPrimaryChip}
                currentDay={currentDay}
                bindableDeadlines={bindableDeadlines}
                footer={entryFooter?.(entry)}
                onMutated={onMutated}
              />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

function TimelineRow({
  campaignId,
  campaignShortId,
  entry,
  linkerOptions,
  policy,
  showPrimaryChip,
  currentDay,
  bindableDeadlines,
  footer,
  onMutated,
}: {
  campaignId: string
  campaignShortId: string
  entry: TimelineEntryView
  linkerOptions: LinkerOption[]
  policy: TimelineEntryPolicy
  showPrimaryChip: boolean
  currentDay: number | null
  bindableDeadlines: BindableDeadline[]
  footer: React.ReactNode
  onMutated?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()

  const editTarget = policy.editTarget(entry)

  // The h-6 box centers the dot/flag on the entry's first row — the chip,
  // badge, and icon-xs actions are all 24px tall — so the glyph sits on the
  // label's midline instead of floating above it.
  const gutter = (
    <div aria-hidden className="flex flex-col items-center">
      <span className="flex h-6 shrink-0 items-center">
        {entry.resolves !== null ? (
          <FlagIcon weight="fill" className="size-3.5 shrink-0 text-primary" />
        ) : (
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              entry.isWorld && entry.category === null
                ? "bg-primary"
                : entry.category !== null
                  ? CATEGORY_DOT_CLASSES[entry.category]
                  : "bg-muted-foreground"
            )}
          />
        )}
      </span>
      <span className="mt-1 w-px flex-1 bg-border" />
    </div>
  )

  if (editing && editTarget !== null) {
    return (
      <li className="flex gap-3.5 py-3">
        {gutter}
        <div className="min-w-0 flex-1">
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
              slotted: !entry.isWorld,
            }}
            onDone={() => {
              setEditing(false)
              onMutated?.()
            }}
          />
        </div>
      </li>
    )
  }

  const remove = () =>
    startTransition(async () => {
      const result = await deleteActivityAction({
        campaignId,
        updateId: entry.id,
      })
      if (!result.ok) {
        toast.error("Couldn't delete the update. Try again.")
        return
      }
      onMutated?.()
    })

  const badgeLabel = entry.isWorld
    ? entry.category === null
      ? "World update"
      : `World · ${ACTIVITY_CATEGORY_LABELS[entry.category]}`
    : `Downtime · ${entry.category === null ? "" : ACTIVITY_CATEGORY_LABELS[entry.category]}`

  const pills = (showPrimaryChip ? entry.concerns : entry.others).map(
    (participant) => ({
      kind: participant.ref.kind,
      id: participant.ref.id,
      label: participant.label,
      tombstoned: participant.tombstoned,
    })
  )

  const showMenu =
    (policy.canRedate?.(entry) ?? false) ||
    (entry.isWorld && (entry.resolves !== null || bindableDeadlines.length > 0))

  return (
    <li className="flex gap-3.5 border-b border-border/40 py-3 last:border-b-0">
      {gutter}
      <div className="min-w-0 flex-1">
        <UpdateEntryCard
          chrome="bare"
          badgeLabel={badgeLabel}
          body={entry.body}
          isIdle={entry.category === "idle"}
          pills={pills}
          pillsLabel={
            showPrimaryChip && pills.length > 0 ? "Concerns" : undefined
          }
          chip={
            showPrimaryChip && entry.primary !== null ? (
              <ParticipantPreviewPill
                kind={entry.primary.ref.kind}
                id={entry.primary.ref.id}
                label={entry.primary.label}
                tombstoned={entry.primary.tombstoned}
                className="max-w-60 text-sm font-semibold"
              />
            ) : undefined
          }
          flag={
            entry.resolves !== null ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-xs text-primary-text"
                render={
                  <Link
                    href={campaignArticlePath(
                      campaignShortId,
                      entry.resolves.ref.id
                    )}
                  />
                }
              >
                <FlagIcon weight="fill" className="size-3" />
                Resolves · {entry.resolves.label}
              </Badge>
            ) : undefined
          }
          menu={
            showMenu ? (
              <TimelineEntryMenu
                campaignId={campaignId}
                entry={entry}
                currentDay={currentDay}
                canRedate={policy.canRedate?.(entry) ?? false}
                bindableDeadlines={bindableDeadlines}
                onMutated={onMutated}
              />
            ) : undefined
          }
          onEdit={editTarget !== null ? () => setEditing(true) : undefined}
          onDelete={policy.canDelete(entry) ? remove : undefined}
        />
        {footer}
      </div>
    </li>
  )
}
