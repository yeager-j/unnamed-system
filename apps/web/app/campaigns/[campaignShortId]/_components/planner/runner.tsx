"use client"

import {
  CaretRightIcon,
  CastleTurretIcon,
  CheckCircleIcon,
  ClockIcon,
  DotsThreeVerticalIcon,
  HourglassIcon,
  MoonIcon,
  PencilSimpleIcon,
  PlusIcon,
  ScrollIcon,
  SunIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { Fragment, useState, useTransition } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import type { DayEndReadiness } from "@/domain/planner/day-end"
import type { ResolvedParticipant } from "@/domain/planner/participant"
import type { RosterGlanceView } from "@/domain/planner/view/glance"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { RosterRowView } from "@/domain/planner/view/roster"
import type { RunnerSlotView } from "@/domain/planner/view/runner"
import {
  advanceClockAction,
  unAdvanceClockAction,
} from "@/lib/actions/campaign-clock/advance"
import { endDayAction } from "@/lib/actions/campaign-clock/end-day"
import {
  addSlotAction,
  renameSlotAction,
} from "@/lib/actions/campaign-clock/slots"
import type { EndDayMode } from "@/lib/db/writes/campaign-clock"

import type { ComposerLastActivity } from "../composer/activity-composer"
import { DowntimeWorkspace, type WorkspaceActivity } from "./downtime-workspace"
import { DungeonSlotCard } from "./dungeon-slot-card"
import { RunMenus, type RunnableDungeon, type ShelfBeat } from "./run-menus"
import { runnerErrorToast } from "./runner-errors"
import { useRunnerSelection } from "./runner-selection"
import { SetAsideDisclosure, type SetAsideEntry } from "./set-aside-disclosure"
import { StoryBeatCard } from "./story-beat-card"

/** Everything the downtime workspace renders, loaded once by the page. */
export interface RunnerWorkspaceData {
  roster: RosterRowView[]
  glances: Record<string, RosterGlanceView>
  activities: WorkspaceActivity[]
  lastActivityByCharacter: Record<string, ComposerLastActivity>
  linkerOptions: LinkerOption[]
}

function SlotIcon({ label, className }: { label: string; className?: string }) {
  const Icon = SLOT_ICONS[slotIconKey(label)]
  return <Icon className={className} />
}

const SLOT_ICONS = { sun: SunIcon, moon: MoonIcon, clock: ClockIcon } as const

/** Slot label → rail icon key: the handoff's sun/moon pair, a clock otherwise. */
function slotIconKey(label: string): keyof typeof SLOT_ICONS {
  if (/morning|dawn|day/i.test(label)) return "sun"
  if (/evening|night|dusk/i.test(label)) return "moon"
  return "clock"
}

/**
 * The Day Runner's body (handoff Screen 1): the "Run the day" header with
 * the pull-in menus (downtime slots only), End-the-day + the un-advance/skip
 * menu, the kind-aware slot rail, and the per-slot body — the story-beat
 * card, the dungeon claim card (each over the set-aside disclosure when the
 * slot suppresses recorded entries), or the downtime resolution workspace.
 * Writes ride `useTransition` (controls never disable on pending) and the
 * RSC refresh after `revalidatePath` supplies fresh state — no local copies.
 */
export function Runner({
  campaignId,
  campaignShortId,
  currentDay,
  clockVersion,
  seasonLabel,
  slots,
  beatParticipants,
  workspace,
  readiness,
  shelf,
  dungeons,
}: {
  campaignId: string
  campaignShortId: string
  currentDay: number
  clockVersion: number
  seasonLabel: string | null
  slots: RunnerSlotView[]
  /** Resolved chip participants per beat id (the story card's chips + body). */
  beatParticipants: Record<string, ResolvedParticipant[]>
  workspace: RunnerWorkspaceData
  /** The day-end cue: brightens "End the day" and feeds the warning's copy. */
  readiness: DayEndReadiness
  /** The prepped shelf (floating beats) for the pull-in menu. */
  shelf: ShelfBeat[]
  /** The campaign's dungeons for the "Run a dungeon" menu. */
  dungeons: RunnableDungeon[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { activeSlotId, setActiveSlot } = useRunnerSelection()

  const activeSlot =
    slots.find((slot) => slot.id === activeSlotId) ?? slots[0] ?? null

  const run = (
    write: () => Promise<{ ok: true } | { ok: false; error: string }>,
    after?: () => void
  ) =>
    startTransition(async () => {
      const result = await write()
      if (!result.ok) {
        runnerErrorToast(result.error)
        // "not-ready" means this tab's readiness cue was stale — refresh so
        // the recount re-renders and the next click gets the warning.
        if (result.error === "stale" || result.error === "not-ready") {
          router.refresh()
        }
        return
      }
      after?.()
    })

  /** Mark-resolved's auto-advance: step the rail to the slot after `slotId`. */
  const advanceToSlotAfter = (slotId: string) => {
    const index = slots.findIndex((slot) => slot.id === slotId)
    const next = index === -1 ? undefined : slots[index + 1]
    if (next) setActiveSlot(next.id)
  }

  const setAsideEntries = (slotId: string): SetAsideEntry[] => {
    const nameById = new Map(workspace.roster.map((row) => [row.id, row.name]))
    return workspace.activities
      .filter((activity) => activity.slotId === slotId)
      .map((activity) => ({
        id: activity.id,
        characterName: nameById.get(activity.characterId) ?? "Unknown",
        category: activity.category,
        body: activity.body,
      }))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl text-foreground">Run the day</h1>
          <p className="text-sm text-muted-foreground">
            Day {currentDay}
            {seasonLabel ? ` · ${seasonLabel}` : null}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {activeSlot?.kind === "downtime" ? (
            <RunMenus
              campaignId={campaignId}
              activeSlotId={activeSlot.id}
              recordedSlotIds={[
                ...new Set(
                  workspace.activities.map((activity) => activity.slotId)
                ),
              ]}
              shelf={shelf}
              dungeons={dungeons}
            />
          ) : null}
          <EndDayButton
            currentDay={currentDay}
            readiness={readiness}
            onEndWith={(mode) =>
              run(() =>
                endDayAction({
                  campaignId,
                  mode,
                  expectedVersion: clockVersion,
                })
              )
            }
          />
          <ClockMenu
            currentDay={currentDay}
            onSkip={(days) =>
              run(() =>
                advanceClockAction({
                  campaignId,
                  days,
                  expectedVersion: clockVersion,
                })
              )
            }
            onUnAdvance={() =>
              run(() =>
                unAdvanceClockAction({
                  campaignId,
                  expectedVersion: clockVersion,
                })
              )
            }
          />
        </div>
      </header>

      {/* w-max + mx-auto centers the pills (per the handoff) while narrow and
          hands over to the horizontal scroll once the day outgrows the row. */}
      <div className="overflow-x-auto border-b bg-muted/12">
        <div className="mx-auto flex w-max items-stretch gap-2 px-4 py-3 md:px-6">
          {slots.map((slot, index) => (
            <Fragment key={slot.id}>
              {index > 0 ? (
                <CaretRightIcon className="size-4 shrink-0 self-center text-muted-foreground/50" />
              ) : null}
              <SlotPill
                slot={slot}
                isActive={activeSlot?.id === slot.id}
                onSelect={() => setActiveSlot(slot.id)}
                onRename={(label) =>
                  run(() =>
                    renameSlotAction({
                      campaignId,
                      slotId: slot.id,
                      label,
                      expectedVersion: clockVersion,
                    })
                  )
                }
              />
            </Fragment>
          ))}
          <AddSlotButton
            onAdd={(label) =>
              run(() =>
                addSlotAction({
                  campaignId,
                  day: currentDay,
                  label,
                  expectedVersion: clockVersion,
                })
              )
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeSlot === null ? null : activeSlot.kind === "story" &&
          activeSlot.beat !== null ? (
          <>
            <StoryBeatCard
              campaignId={campaignId}
              campaignShortId={campaignShortId}
              beat={activeSlot.beat}
              participants={beatParticipants[activeSlot.beat.id] ?? []}
              onResolved={() => advanceToSlotAfter(activeSlot.id)}
            />
            <SetAsideDisclosure entries={setAsideEntries(activeSlot.id)} />
          </>
        ) : activeSlot.kind === "dungeon" && activeSlot.dungeon !== null ? (
          <>
            <DungeonSlotCard
              campaignId={campaignId}
              campaignShortId={campaignShortId}
              dungeon={activeSlot.dungeon}
              slotId={activeSlot.id}
              onResolved={() => advanceToSlotAfter(activeSlot.id)}
            />
            <SetAsideDisclosure entries={setAsideEntries(activeSlot.id)} />
          </>
        ) : (
          <DowntimeWorkspace
            campaignId={campaignId}
            slot={{ id: activeSlot.id, label: activeSlot.label }}
            roster={workspace.roster}
            glances={workspace.glances}
            activities={workspace.activities}
            lastActivityByCharacter={workspace.lastActivityByCharacter}
            linkerOptions={workspace.linkerOptions}
          />
        )}
      </div>
      {/* isPending intentionally unused for disabling — controls never disable on pending. */}
      <span className="sr-only" aria-live="polite">
        {isPending ? "Saving…" : ""}
      </span>
    </div>
  )
}

function SlotPill({
  slot,
  isActive,
  onSelect,
  onRename,
}: {
  slot: RunnerSlotView
  isActive: boolean
  onSelect: () => void
  onRename: (label: string) => void
}) {
  const [renameOpen, setRenameOpen] = useState(false)

  return (
    <div
      className={cn(
        "relative flex max-w-[340px] min-w-56 shrink-0 rounded-lg border bg-card transition-colors",
        isActive
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:border-muted-foreground/40"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-6 py-2.5 text-center"
      >
        <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Slot {slot.ordinal + 1}
          {slot.done ? (
            <CheckCircleIcon
              aria-label="Slot resolved"
              weight="fill"
              className="size-3.5 text-green-500"
            />
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          {slot.kind === "story" ? (
            <ScrollIcon className="size-4 shrink-0 text-gold" />
          ) : slot.kind === "dungeon" ? (
            <CastleTurretIcon className="size-4 shrink-0 text-gold" />
          ) : (
            <SlotIcon
              label={slot.label}
              className="size-4 shrink-0 text-gold"
            />
          )}
          <span className="truncate">{slot.label}</span>
        </span>
        <span className="max-w-full truncate text-xs text-muted-foreground">
          {slot.meta}
        </span>
      </button>
      {isActive ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-1.5 right-1.5 text-muted-foreground"
          aria-label={`Rename ${slot.label}`}
          onClick={() => setRenameOpen(true)}
        >
          <PencilSimpleIcon />
        </Button>
      ) : null}
      {renameOpen ? (
        <LabelDialog
          open
          onOpenChange={setRenameOpen}
          title="Rename slot"
          description="Renames this slot on this day only — the day template lives in Manage Campaign."
          confirmLabel="Rename"
          initialValue={slot.label}
          onSubmit={onRename}
        />
      ) : null}
    </div>
  )
}

function AddSlotButton({ onAdd }: { onAdd: (label: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add a slot to this day"
        className="flex size-12 shrink-0 items-center justify-center self-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-muted-foreground/60 hover:text-foreground"
      >
        <PlusIcon className="size-4" />
      </button>
      {open ? (
        <LabelDialog
          open
          onOpenChange={setOpen}
          title="Add a slot"
          description="Appends a slot to today only. Edit the day template in Manage Campaign to change every new day."
          confirmLabel="Add slot"
          initialValue=""
          placeholder="Night"
          onSubmit={onAdd}
        />
      ) : null}
    </>
  )
}

/**
 * One text-input dialog, shared by rename and add-slot. Mounted only while
 * open (as are the runner's confirm dialogs): an SSR'd *closed* Base UI
 * dialog still consumes an id slot server-side, shifting every Base UI id
 * after it and desyncing hydration — and mount-on-open is the cheaper
 * pattern anyway.
 */
function LabelDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  initialValue,
  placeholder,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  initialValue: string
  placeholder?: string
  onSubmit: (label: string) => void
}) {
  const [value, setValue] = useState(initialValue)

  const submit = () => {
    const label = value.trim()
    if (!label) return
    onSubmit(label)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="slot-label">Label</Label>
          <Input
            id="slot-label"
            value={value}
            placeholder={placeholder}
            maxLength={40}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "End the day" (FR-5): muted (`outline`) until {@link DayEndReadiness}
 * completes, then it brightens — the anti-forgetting cue. A ready day gets
 * the plain advance confirm (mode `"advance"` — the server recounts and
 * refuses `"not-ready"` if this tab's cue went stale); an unready one gets
 * the **day-end warning** (Cancel / Defer Unresolved / Resolve All — both
 * proceed paths bulk-fill Idle for missing characters, stated in the copy).
 */
function EndDayButton({
  currentDay,
  readiness,
  onEndWith,
}: {
  currentDay: number
  readiness: DayEndReadiness
  onEndWith: (mode: EndDayMode) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant={readiness.ready ? "default" : "outline"}
        onClick={() => setOpen(true)}
      >
        <HourglassIcon />
        End the day
      </Button>
      {open ? (
        readiness.ready ? (
          <EndDayConfirm
            currentDay={currentDay}
            onOpenChange={setOpen}
            onConfirm={() => onEndWith("advance")}
          />
        ) : (
          <DayEndWarning
            currentDay={currentDay}
            readiness={readiness}
            onOpenChange={setOpen}
            onEndWith={onEndWith}
          />
        )
      ) : null}
    </>
  )
}

function EndDayConfirm({
  currentDay,
  onOpenChange,
  onConfirm,
}: {
  currentDay: number
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            End Day {currentDay} — advance to Day {currentDay + 1}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Moves the clock forward and sets up tomorrow&apos;s slots. You can
            go back one day from the ⋯ menu if you jump the gun.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            End the day
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Sentence fragments for the warning's loose-ends line. */
function looseEndsLine(readiness: DayEndReadiness): string {
  const parts: string[] = []
  if (readiness.unresolvedStorySlots > 0) {
    parts.push(
      readiness.unresolvedStorySlots === 1
        ? "a story beat is unresolved"
        : `${readiness.unresolvedStorySlots} story beats are unresolved`
    )
  }
  if (readiness.unresolvedDungeonSlots > 0) {
    parts.push(
      readiness.unresolvedDungeonSlots === 1
        ? "a delve is unresolved"
        : `${readiness.unresolvedDungeonSlots} delves are unresolved`
    )
  }
  if (readiness.missingEntries > 0) {
    parts.push(
      readiness.missingEntries === 1
        ? "a downtime entry is missing"
        : `${readiness.missingEntries} downtime entries are missing`
    )
  }
  return parts.join(", ")
}

/**
 * The day-end warning (FR-5): the soft safety net over an unfinished day.
 * **Resolve All** = "it all happened, I just didn't tick"; **Defer
 * Unresolved** = "we didn't get to those scenes" (beats float to the shelf
 * with a return ticket, delves unclaim — re-claim tomorrow). Both fill every
 * missing downtime entry with a quiet Idle mark and advance. The app never
 * auto-defers — this dialog is the only place either bulk action fires.
 */
function DayEndWarning({
  currentDay,
  readiness,
  onOpenChange,
  onEndWith,
}: {
  currentDay: number
  readiness: DayEndReadiness
  onOpenChange: (open: boolean) => void
  onEndWith: (mode: EndDayMode) => void
}) {
  const hasUnresolved =
    readiness.unresolvedStorySlots > 0 || readiness.unresolvedDungeonSlots > 0
  const end = (mode: EndDayMode) => {
    onOpenChange(false)
    onEndWith(mode)
  }
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            End Day {currentDay} with loose ends?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Right now {looseEndsLine(readiness)}.{" "}
            {hasUnresolved ? (
              <>
                <strong>Resolve All</strong> marks the beats and delves
                resolved; <strong>Defer Unresolved</strong> floats the beats to
                your prepped shelf and unclaims the delves (the dungeons stay in
                your library — claim them again tomorrow).{" "}
              </>
            ) : null}
            Characters still missing an entry get a quiet Idle mark either way,
            and the clock moves to Day {currentDay + 1}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {hasUnresolved ? (
            <Button variant="outline" onClick={() => end("defer-unresolved")}>
              Defer Unresolved
            </Button>
          ) : null}
          <AlertDialogAction onClick={() => end("resolve-all")}>
            Resolve All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ClockMenu({
  currentDay,
  onSkip,
  onUnAdvance,
}: {
  currentDay: number
  onSkip: (days: number) => void
  onUnAdvance: () => void
}) {
  const [unAdvanceOpen, setUnAdvanceOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipDays, setSkipDays] = useState("3")

  const submitSkip = () => {
    const days = Number.parseInt(skipDays, 10)
    if (!Number.isInteger(days) || days < 1) return
    onSkip(days)
    setSkipOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="More clock actions"
            />
          }
        >
          <DotsThreeVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setSkipOpen(true)}>
            Skip ahead several days…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUnAdvanceOpen(true)}>
            Go back to Day {currentDay - 1}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {skipOpen ? (
        <Dialog open onOpenChange={setSkipOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Skip ahead</DialogTitle>
              <DialogDescription>
                Advances the clock several days at once and sets up slots for
                every day skipped.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="skip-days">Days</Label>
              <Input
                id="skip-days"
                type="number"
                min={1}
                max={365}
                value={skipDays}
                onChange={(event) => setSkipDays(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSkip()
                }}
              />
              {Number.parseInt(skipDays, 10) >= 1 ? (
                <p className="text-sm text-muted-foreground">
                  Lands on Day {currentDay + Number.parseInt(skipDays, 10)}.
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkipOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitSkip}>Skip ahead</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {unAdvanceOpen ? (
        <AlertDialog open onOpenChange={setUnAdvanceOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Go back to Day {currentDay - 1}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Un-advance only moves the day counter back — nothing else is
                undone. Beats resolved or deferred when the day ended stay that
                way (deferred ones wait on your prepped shelf), removed delve
                claims stay removed, and any Idle marks the day-end fill wrote
                remain as recorded entries you can edit or delete.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setUnAdvanceOpen(false)
                  onUnAdvance()
                }}
              >
                Go back
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}
