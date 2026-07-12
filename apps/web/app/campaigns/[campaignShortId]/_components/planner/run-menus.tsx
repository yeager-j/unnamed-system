import {
  ArrowUUpLeftIcon,
  CaretDownIcon,
  CastleTurretIcon,
  PlusCircleIcon,
  ScrollIcon,
} from "@phosphor-icons/react/dist/ssr"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { claimDungeonSlotAction } from "@/lib/actions/campaign-clock/dungeon-claim"
import { createBeatAction } from "@/lib/actions/campaign-notes/beat"
import { scheduleBeatAction } from "@/lib/actions/campaign-notes/schedule"

import { runnerErrorToast } from "./runner-errors"

/** A prepped-shelf beat (floating), with any defer provenance the page kept. */
export interface ShelfBeat {
  id: string
  title: string
  /** One-click return target — present only while it's open and not past. */
  returnTo: { slotId: string; day: number; label: string } | null
}

/** A claimable dungeon (the campaign's list). */
export interface RunnableDungeon {
  id: string
  name: string
}

type PendingRun =
  | { kind: "pull"; beatId: string; title: string; slotId: string }
  | { kind: "new"; slotId: string }
  | { kind: "claim"; dungeonId: string; name: string; slotId: string }

/**
 * The runner header's pull-in menus (UNN-577, FR-5 / D9): **Run story beat**
 * (the prepped shelf — floating beats, one-click "return to Day N · ⟨slot⟩"
 * for deferred ones, and "New story beat" minted straight into the slot) and
 * **Run a dungeon** (claim the active slot for a delve). Rendered only while
 * the active slot is downtime. Pulling into a slot with recorded entries
 * fires the **set-aside confirm** (D3: consent happens once, here); the
 * entries are kept and resurface if the beat defers or the claim is removed.
 */
export function RunMenus({
  campaignId,
  activeSlotId,
  recordedSlotIds,
  shelf,
  dungeons,
}: {
  campaignId: string
  activeSlotId: string
  /** Today's slot ids that already hold at least one recorded entry. */
  recordedSlotIds: readonly string[]
  shelf: ShelfBeat[]
  dungeons: RunnableDungeon[]
}) {
  const [confirming, setConfirming] = useState<PendingRun | null>(null)
  const [, startTransition] = useTransition()

  const execute = (run: PendingRun) =>
    startTransition(async () => {
      const result =
        run.kind === "pull"
          ? await scheduleBeatAction({
              campaignId,
              beatId: run.beatId,
              slotId: run.slotId,
            })
          : run.kind === "new"
            ? await createBeatAction({ campaignId, slotId: run.slotId })
            : await claimDungeonSlotAction({
                campaignId,
                slotId: run.slotId,
                dungeonId: run.dungeonId,
              })
      if (!result.ok) runnerErrorToast(result.error)
    })

  const request = (run: PendingRun) => {
    if (recordedSlotIds.includes(run.slotId)) setConfirming(run)
    else execute(run)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <ScrollIcon />
          Run story beat
          <CaretDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-[10px] tracking-wider uppercase">
              {shelf.length > 0
                ? `Prepped beats · ${shelf.length}`
                : "No prepped beats"}
            </DropdownMenuLabel>
            {shelf.map((beat) => {
              const title =
                beat.title.trim() === "" ? "Untitled beat" : beat.title
              return (
                <Fragment key={beat.id}>
                  <DropdownMenuItem
                    onClick={() =>
                      request({
                        kind: "pull",
                        beatId: beat.id,
                        title,
                        slotId: activeSlotId,
                      })
                    }
                  >
                    <ScrollIcon className="text-gold" />
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                    <span className="text-xs text-muted-foreground">
                      pull in
                    </span>
                  </DropdownMenuItem>
                  {beat.returnTo !== null &&
                  beat.returnTo.slotId !== activeSlotId ? (
                    <DropdownMenuItem
                      className="text-muted-foreground"
                      onClick={() =>
                        request({
                          kind: "pull",
                          beatId: beat.id,
                          title,
                          slotId: beat.returnTo!.slotId,
                        })
                      }
                    >
                      <ArrowUUpLeftIcon className="ml-4" />
                      Return to Day {beat.returnTo.day} · {beat.returnTo.label}
                    </DropdownMenuItem>
                  ) : null}
                </Fragment>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => request({ kind: "new", slotId: activeSlotId })}
          >
            <PlusCircleIcon className="text-primary-text" />
            New story beat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <CastleTurretIcon />
          Run a dungeon
          <CaretDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-[10px] tracking-wider uppercase">
              {dungeons.length > 0
                ? `Dungeons · ${dungeons.length}`
                : "No dungeons yet"}
            </DropdownMenuLabel>
            {dungeons.map((dungeon) => (
              <DropdownMenuItem
                key={dungeon.id}
                onClick={() =>
                  request({
                    kind: "claim",
                    dungeonId: dungeon.id,
                    name: dungeon.name,
                    slotId: activeSlotId,
                  })
                }
              >
                <CastleTurretIcon className="text-gold" />
                <span className="min-w-0 flex-1 truncate">{dungeon.name}</span>
                <span className="text-xs text-muted-foreground">
                  claim slot
                </span>
              </DropdownMenuItem>
            ))}
            {dungeons.length === 0 ? (
              <DropdownMenuItem disabled>
                Create one from the dungeon library first.
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirming ? (
        <SetAsideConfirm
          run={confirming}
          onOpenChange={(open) => {
            if (!open) setConfirming(null)
          }}
          onConfirm={() => {
            setConfirming(null)
            execute(confirming)
          }}
        />
      ) : null}
    </>
  )
}

/** The D3 consent moment — mock copy, one dialog for both pull-in kinds. */
function SetAsideConfirm({
  run,
  onOpenChange,
  onConfirm,
}: {
  run: PendingRun
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const isClaim = run.kind === "claim"
  const label =
    run.kind === "pull"
      ? `“${run.title}”`
      : run.kind === "claim"
        ? `“${run.name}”`
        : "a new beat"
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isClaim ? "Run a dungeon here?" : "Run a story beat here?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This slot has recorded downtime. Running {label} sets those
            activities aside (they&apos;re kept — you can flip the slot back).
            To keep them, add a new slot instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {isClaim ? "Run dungeon anyway" : "Run beat anyway"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
