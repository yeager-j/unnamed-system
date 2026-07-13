"use client"

import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { mergeChroniclePages } from "@/domain/planner/view/chronicle"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { TimelineDayView } from "@/domain/planner/view/timeline"
import { loadChroniclePageAction } from "@/lib/actions/campaign-updates/chronicle"
import type { ChronicleFilters } from "@/lib/db/queries/load-campaign-updates"

import type { ComposerTarget } from "../composer/activity-composer"
import type { BindableDeadline } from "../timeline/timeline-entry-menu"
import { UpdateTimeline } from "../timeline/update-timeline"

/**
 * The Chronicle's feed (UNN-580, FR-13): the RSC-rendered first page plus
 * client-appended older slices behind **"Load earlier days"** — each slice a
 * keyset page fetched through the read action (an IntersectionObserver
 * upgrade would call the same action; nothing here blocks it). Mutations on
 * appended rows replay every appended cursor — keyset cursors are
 * value-anchored, so a replay is consistent, no offset drift. The first page
 * needs no replay: `revalidatePath` refreshes it through the RSC tree.
 */
export function ChronicleFeed({
  campaignId,
  campaignShortId,
  currentDay,
  filters,
  initialDays,
  initialCursor,
  linkerOptions,
  bindableDeadlines,
}: {
  campaignId: string
  campaignShortId: string
  currentDay: number
  filters: ChronicleFilters
  initialDays: TimelineDayView[]
  initialCursor: string | null
  linkerOptions: LinkerOption[]
  bindableDeadlines: BindableDeadline[]
}) {
  const [slices, setSlices] = useState<
    { cursor: string; days: TimelineDayView[] }[]
  >([])
  const [nextCursor, setNextCursor] = useState(initialCursor)
  const [isPending, startTransition] = useTransition()

  const days = slices.reduce(
    (merged, slice) => mergeChroniclePages(merged, slice.days),
    initialDays
  )

  const loadMore = () => {
    const cursor = nextCursor
    if (cursor === null) return
    startTransition(async () => {
      const result = await loadChroniclePageAction({
        campaignId,
        cursor,
        filters,
      })
      if (!result.ok) {
        toast.error("Couldn't load earlier days. Try again.")
        return
      }
      setSlices((current) => [...current, { cursor, days: result.value.days }])
      setNextCursor(result.value.nextCursor)
    })
  }

  const replaySlices = () => {
    const cursors = slices.map((slice) => slice.cursor)
    if (cursors.length === 0) return
    startTransition(async () => {
      const results = await Promise.all(
        cursors.map((cursor) =>
          loadChroniclePageAction({ campaignId, cursor, filters })
        )
      )
      if (results.some((result) => !result.ok)) return
      setSlices(
        cursors.map((cursor, index) => {
          const result = results[index]!
          return {
            cursor,
            days: result.ok ? result.value.days : [],
          }
        })
      )
      const last = results.at(-1)
      if (last?.ok) setNextCursor(last.value.nextCursor)
    })
  }

  const editTarget: ComposerTarget = {
    kind: "world",
    primary: null,
    primaryLabel: "The world",
    currentDay,
  }

  return (
    <div className="flex flex-col gap-5">
      <UpdateTimeline
        campaignId={campaignId}
        campaignShortId={campaignShortId}
        days={days}
        linkerOptions={linkerOptions}
        currentDay={currentDay}
        bindableDeadlines={bindableDeadlines}
        policy={{
          editTarget: (entry) =>
            entry.isWorld || entry.day === currentDay ? editTarget : null,
          canDelete: (entry) => entry.isWorld || entry.day === currentDay,
          canRedate: (entry) => entry.resolves === null,
        }}
        emptyMessage="Nothing here yet — recorded downtime and world updates gather into the Chronicle."
        onMutated={replaySlices}
      />
      {nextCursor !== null ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={isPending}>
            <CaretDownIcon />
            {isPending ? "Loading…" : "Load earlier days"}
          </Button>
        </div>
      ) : days.length > 0 ? (
        <p className="text-center font-mono text-xs text-muted-foreground">
          — Day 1 · the beginning —
        </p>
      ) : null}
    </div>
  )
}
