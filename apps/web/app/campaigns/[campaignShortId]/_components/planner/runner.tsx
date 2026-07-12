"use client"

import {
  ClockIcon,
  DotsThreeVerticalIcon,
  HourglassIcon,
  MoonIcon,
  PencilSimpleIcon,
  PlusIcon,
  SunIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import {
  advanceClockAction,
  unAdvanceClockAction,
} from "@/lib/actions/campaign-clock/advance"
import {
  addSlotAction,
  renameSlotAction,
} from "@/lib/actions/campaign-clock/slots"

/** The runner's slice of a slot row — id + display facts, no storage extras. */
export interface RunnerSlot {
  id: string
  ordinal: number
  label: string
}

const CLOCK_ERROR_COPY: Record<string, string> = {
  stale:
    "The clock moved under you — probably another tab. Refresh to catch up.",
  "clock-not-found": "The clock is gone — refresh the page.",
  "at-floor": "Already at the earliest day the clock has seen.",
  "frozen-day": "That day is in the past — history stays put.",
  "day-not-materialized": "That day has no slots yet.",
  "slot-not-found": "That slot no longer exists — refresh the page.",
  "invalid-input": "Couldn't save — that input doesn't look right.",
}

function clockErrorToast(error: string) {
  toast.error(CLOCK_ERROR_COPY[error] ?? "Couldn't update the clock.")
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
 * The Day Runner's phase-1 body (handoff Screen 1): the "Run the day" header
 * with End-the-day + the un-advance/skip menu, and the slot rail. Every slot
 * is downtime in phase 1 — beats, claims, and the downtime workspace land in
 * phases 3–4, so the active slot renders an honest placeholder. Writes ride
 * `useTransition` (controls never disable on pending) and the RSC refresh
 * after `revalidatePath` supplies the new clock state — no local clock copy.
 */
export function Runner({
  campaignId,
  currentDay,
  clockVersion,
  seasonLabel,
  slots,
}: {
  campaignId: string
  currentDay: number
  clockVersion: number
  seasonLabel: string | null
  slots: RunnerSlot[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)

  const activeSlot =
    slots.find((slot) => slot.id === activeSlotId) ?? slots[0] ?? null

  const run = (
    write: () => Promise<{ ok: true } | { ok: false; error: string }>,
    after?: () => void
  ) =>
    startTransition(async () => {
      const result = await write()
      if (!result.ok) {
        clockErrorToast(result.error)
        if (result.error === "stale") router.refresh()
        return
      }
      after?.()
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-1 data-vertical:h-4 data-vertical:self-auto"
        />
        <div className="min-w-0">
          <h1 className="font-display text-xl text-foreground">Run the day</h1>
          <p className="text-sm text-muted-foreground">
            Day {currentDay}
            {seasonLabel ? ` · ${seasonLabel}` : null}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <EndDayButton
            currentDay={currentDay}
            onConfirm={(days) =>
              run(() =>
                advanceClockAction({
                  campaignId,
                  days,
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

      <div className="flex items-stretch gap-2 overflow-x-auto border-b bg-muted/20 px-4 py-3 md:px-6">
        {slots.map((slot) => (
          <SlotPill
            key={slot.id}
            slot={slot}
            isActive={activeSlot?.id === slot.id}
            onSelect={() => setActiveSlotId(slot.id)}
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

      <div className="flex flex-1 items-center justify-center p-6">
        {activeSlot ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SlotIcon label={activeSlot.label} />
              </EmptyMedia>
              <EmptyTitle>
                {activeSlot.label} · Day {currentDay}
              </EmptyTitle>
              <EmptyDescription>
                This slot is downtime. Recording what each character did — and
                running story beats over it — arrives with Session Notes.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
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
  slot: RunnerSlot
  isActive: boolean
  onSelect: () => void
  onRename: (label: string) => void
}) {
  const [renameOpen, setRenameOpen] = useState(false)

  return (
    <div
      className={cn(
        "relative flex max-w-[340px] min-w-44 shrink-0 rounded-lg border bg-card text-left transition-colors",
        isActive
          ? "border-primary ring-1 ring-primary"
          : "hover:border-muted-foreground/40"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5"
      >
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Slot {slot.ordinal + 1}
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <SlotIcon
            label={slot.label}
            className="size-4 text-muted-foreground"
          />
          <span className="truncate">{slot.label}</span>
        </span>
        <span className="text-xs text-muted-foreground">Downtime</span>
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
        className="flex w-12 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-muted-foreground/60 hover:text-foreground"
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

function EndDayButton({
  currentDay,
  onConfirm,
}: {
  currentDay: number
  onConfirm: (days: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <HourglassIcon />
        End the day
      </Button>
      {open ? (
        <EndDayConfirm
          currentDay={currentDay}
          onOpenChange={setOpen}
          onConfirm={onConfirm}
        />
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
  onConfirm: (days: number) => void
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
              onConfirm(1)
            }}
          >
            End the day
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
                Un-advance only moves the day counter back — anything you
                recorded or resolved stays exactly as it is.
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
