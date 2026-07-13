"use client"

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CastleTurretIcon,
  FlagBannerIcon,
  HourglassIcon,
  PencilSimpleLineIcon,
  ScrollIcon,
  StarFourIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import type { DayEndReadiness } from "@/domain/planner/day-end"
import type { DatedDeadline } from "@/domain/planner/deadline"
import {
  dayEndGlanceLine,
  deadlineCountdown,
  type DayEndDeadlineAlert,
  type DayEndPreSuggest,
} from "@/domain/planner/view/day-end"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { TimelineDayView } from "@/domain/planner/view/timeline"
import { resolveDeadlineAction } from "@/lib/actions/campaign-updates/resolve-deadline"
import type { EndDayMode } from "@/lib/db/writes/campaign-clock"
import { campaignChroniclePath } from "@/lib/paths"

import {
  ActivityComposer,
  type ComposerTarget,
} from "../composer/activity-composer"
import { UpdateTimeline } from "../timeline/update-timeline"
import { DayEndWarning } from "./day-end-dialogs"
import { DeadlineGateDialog } from "./deadline-gate-dialog"

/** Everything the capture ritual renders beyond the runner's own props. */
export interface DayEndData {
  glance: { downtimeCount: number; worldCount: number }
  /** Today's slice — slotted activities + world updates, one day group. */
  loggedToday: TimelineDayView[]
  preSuggests: DayEndPreSuggest[]
  alerts: DayEndDeadlineAlert[]
}

/**
 * The **Day-End Capture ritual** (UNN-580, handoff Screen 2 "Time Marches
 * On"; D10: runner-owned view, not a route): review the day's feed, author
 * world updates — pre-suggests **seed the composer, never write** (FR-6) —
 * and advance via the gilded finisher. The capture view *is* the ritual
 * confirm: a ready day advances straight from the finisher; the deadline
 * hard gate and the soft loose-ends warning still interpose. Gold is
 * rationed to the hero glyph and the finisher (brand rule).
 */
export function DayEndCapture({
  campaignId,
  campaignShortId,
  currentDay,
  seasonLabel,
  readiness,
  gateBlockers,
  linkerOptions,
  data,
  onEndWith,
  onBack,
}: {
  campaignId: string
  campaignShortId: string
  currentDay: number
  seasonLabel: string | null
  readiness: DayEndReadiness
  gateBlockers: DatedDeadline[]
  linkerOptions: LinkerOption[]
  data: DayEndData
  onEndWith: (mode: EndDayMode) => void
  onBack: () => void
}) {
  const [activeSuggestId, setActiveSuggestId] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [warningOpen, setWarningOpen] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)

  const suggests = data.preSuggests.filter(
    (suggest) => !dismissedIds.has(suggest.id)
  )
  const activeSuggest =
    suggests.find((suggest) => suggest.id === activeSuggestId) ?? null

  useEffect(() => {
    if (activeSuggestId === null) return
    composerRef.current?.querySelector("textarea")?.focus()
  }, [activeSuggestId])

  const dismiss = (id: string) => {
    setDismissedIds((current) => new Set([...current, id]))
    if (activeSuggestId === id) setActiveSuggestId(null)
  }

  const worldTarget: ComposerTarget = {
    kind: "world",
    primary: null,
    primaryLabel: "The world",
    currentDay,
    primaryOptions: linkerOptions,
  }

  const blocked = gateBlockers.length > 0
  const finish = () => {
    if (blocked) setGateOpen(true)
    else if (readiness.ready) onEndWith("advance")
    else setWarningOpen(true)
  }

  return (
    // Own viewport-bound scroller: in capture mode the roster sidebar (whose
    // explicit height constrains the run-mode row) is hidden, so without
    // this the window scrolls and the app header drifts away.
    <div className="h-[calc(100svh-4.5rem)] flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-0">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeftIcon />
            Back to Day {currentDay}
          </Button>
        </div>

        <header className="flex flex-col items-center gap-2 text-center">
          <StarFourIcon
            weight="fill"
            aria-hidden
            className="size-7 text-gold"
          />
          <h1 className="font-display text-4xl whitespace-nowrap text-foreground">
            Time Marches On
          </h1>
          <p className="text-muted-foreground">
            The party&apos;s updates are recorded. What else moved in the world?
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {dayEndGlanceLine(
              data.glance.downtimeCount,
              data.glance.worldCount
            )}
          </p>
        </header>

        {data.alerts.map((alert) => (
          <DeadlineAlert
            key={alert.articleId}
            campaignId={campaignId}
            alert={alert}
            onLogUpdate={() =>
              setActiveSuggestId(`deadline:${alert.articleId}`)
            }
          />
        ))}

        {suggests.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              Suggested updates — click to draft, nothing writes itself
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggests.map((suggest) => (
                <SuggestChip
                  key={suggest.id}
                  suggest={suggest}
                  active={suggest.id === activeSuggestId}
                  onApply={() => setActiveSuggestId(suggest.id)}
                  onDismiss={() => dismiss(suggest.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div ref={composerRef}>
          <ActivityComposer
            key={activeSuggest?.id ?? "blank"}
            campaignId={campaignId}
            target={worldTarget}
            linkerOptions={linkerOptions}
            placeholder="What happened in the world today?"
            initial={
              activeSuggest === null
                ? undefined
                : {
                    body: activeSuggest.seed.body,
                    primary: activeSuggest.seed.primary,
                    concerns: activeSuggest.seed.concerns,
                  }
            }
            onDone={() => {
              if (activeSuggest !== null) dismiss(activeSuggest.id)
            }}
          />
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
              Logged today
            </h2>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                Day {currentDay}
                {seasonLabel ? ` · ${seasonLabel}` : null}
              </span>
              <Link
                href={`${campaignChroniclePath(campaignShortId)}?day=${currentDay}`}
                className="text-xs font-medium text-primary-text hover:underline"
              >
                Open in Chronicle →
              </Link>
            </div>
          </div>
          <UpdateTimeline
            campaignId={campaignId}
            campaignShortId={campaignShortId}
            days={data.loggedToday}
            linkerOptions={linkerOptions}
            showDayHeaders={false}
            policy={{
              editTarget: () => worldTarget,
              canDelete: () => true,
            }}
            emptyMessage="Nothing logged yet — the day's activities and world updates gather here."
          />
        </section>

        <footer className="flex flex-col items-center gap-2 border-t pt-6 pb-4">
          <Button variant="gilded" size="lg" onClick={finish}>
            <HourglassIcon />
            End Day {currentDay} — advance to Day {currentDay + 1}
            <ArrowRightIcon />
          </Button>
          <p className="text-xs text-muted-foreground">
            Applies updates and moves the clock forwards
          </p>
        </footer>
      </div>

      {gateOpen ? (
        <DeadlineGateDialog
          blockers={gateBlockers}
          campaignShortId={campaignShortId}
          onOpenChange={setGateOpen}
        />
      ) : null}
      {warningOpen ? (
        <DayEndWarning
          currentDay={currentDay}
          readiness={readiness}
          onOpenChange={setWarningOpen}
          onEndWith={onEndWith}
        />
      ) : null}
    </div>
  )
}

const SUGGEST_ICONS: Record<
  DayEndPreSuggest["kind"],
  React.ComponentType<{ className?: string }>
> = {
  beat: ScrollIcon,
  delve: CastleTurretIcon,
  deadline: FlagBannerIcon,
}

function SuggestChip({
  suggest,
  active,
  onApply,
  onDismiss,
}: {
  suggest: DayEndPreSuggest
  active: boolean
  onApply: () => void
  onDismiss: () => void
}) {
  const Icon = SUGGEST_ICONS[suggest.kind]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary-text"
          : "hover:border-muted-foreground/40"
      )}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1.5"
        onClick={onApply}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="max-w-52 truncate">{suggest.chipLabel}</span>
        <PencilSimpleLineIcon
          aria-hidden
          className="size-3 text-muted-foreground"
        />
      </button>
      <button
        type="button"
        aria-label={`Dismiss suggestion: ${suggest.chipLabel}`}
        className="rounded-full p-0.5 hover:bg-foreground/10"
        onClick={onDismiss}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

function DeadlineAlert({
  campaignId,
  alert,
  onLogUpdate,
}: {
  campaignId: string
  alert: DayEndDeadlineAlert
  onLogUpdate: () => void
}) {
  const [, startTransition] = useTransition()
  const countdown = deadlineCountdown(alert)

  const resolve = () =>
    startTransition(async () => {
      const result = await resolveDeadlineAction({
        campaignId,
        articleId: alert.articleId,
        body: "",
      })
      if (!result.ok) toast.error("Couldn't resolve. Try again.")
    })

  return (
    <div className="flex items-center gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10">
        <HourglassIcon className="size-5 text-destructive" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-wider text-destructive uppercase">
          {alert.state === "due" ? "Deadline due" : "Looming deadline"}
        </p>
        <p className="font-medium text-foreground">{alert.name}</p>
        {alert.excerpt !== null ? (
          <p className="truncate text-sm text-muted-foreground">
            {alert.excerpt}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-center">
        <p className="font-mono text-3xl leading-none font-bold text-destructive">
          {countdown.figure}
        </p>
        <p className="font-mono text-[10px] tracking-wider text-destructive/80 uppercase">
          {countdown.label}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button variant="outline" size="sm" onClick={onLogUpdate}>
          <PencilSimpleLineIcon />
          Log an update
        </Button>
        <Button variant="ghost" size="sm" onClick={resolve}>
          <FlagBannerIcon />
          Resolve
        </Button>
      </div>
    </div>
  )
}
