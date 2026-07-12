import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockCountdownIcon,
  NotebookIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState, useTransition } from "react"

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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

import { ChipProse } from "@/app/campaigns/[campaignShortId]/_components/chip-prose"
import { ParticipantPill } from "@/components/shared/participant-pill"
import type { ResolvedParticipant } from "@/domain/planner/participant"
import type { RunnerBeatView } from "@/domain/planner/view/runner"
import {
  deferBeatAction,
  setBeatResolvedAction,
} from "@/lib/actions/campaign-notes/beat"
import { campaignNotesPath } from "@/lib/paths"

import { runnerErrorToast } from "./runner-errors"

/**
 * The runner's **story slot card** (UNN-577, handoff Screen 1 + §2's inline-
 * body delta): kicker + resolved badge, title, tagline, the beat's **body
 * inline** (read-only, collapsible — the at-table surface must not bounce the
 * DM away mid-scene; "Open notes" stays the editing door), participant chips,
 * and the phase-4 controls: **Defer** (confirm → floating shelf, slot reverts
 * to downtime) and **Mark resolved / Reopen** (resolving auto-advances the
 * rail to the next slot).
 */
export function StoryBeatCard({
  campaignId,
  campaignShortId,
  beat,
  participants,
  onResolved,
}: {
  campaignId: string
  campaignShortId: string
  beat: RunnerBeatView
  participants: ResolvedParticipant[]
  /** Fired after a successful Mark resolved — the runner advances the rail. */
  onResolved: () => void
}) {
  const [deferOpen, setDeferOpen] = useState(false)
  const [, startTransition] = useTransition()

  const setResolved = (resolved: boolean) =>
    startTransition(async () => {
      const result = await setBeatResolvedAction({
        campaignId,
        beatId: beat.id,
        resolved,
      })
      if (!result.ok) return runnerErrorToast(result.error)
      if (resolved) onResolved()
    })

  const defer = () =>
    startTransition(async () => {
      const result = await deferBeatAction({ campaignId, beatId: beat.id })
      if (!result.ok) runnerErrorToast(result.error)
    })

  return (
    <div className="mx-auto w-full max-w-2xl rounded-[calc(var(--radius)+4px)] border bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Story beat
        </span>
        {beat.resolved ? (
          <Badge variant="outline" className="gap-1 text-xs">
            <CheckCircleIcon className="size-3.5 text-primary-text" />
            Scene resolved
          </Badge>
        ) : null}
      </div>
      <h2 className="mt-2 font-display text-2xl text-foreground">
        {beat.title}
      </h2>
      {beat.tagline.trim() === "" ? null : (
        <p className="mt-2 text-base text-muted-foreground">{beat.tagline}</p>
      )}
      {beat.body.trim() === "" ? null : (
        <BeatNotes body={beat.body} participants={participants} />
      )}
      {participants.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {participants.map((participant) => (
            <ParticipantPill
              key={`${participant.ref.kind}:${participant.ref.id}`}
              kind={participant.ref.kind}
              label={participant.label}
              tombstoned={participant.tombstoned}
              className="text-xs"
            />
          ))}
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        <Button
          variant="outline"
          render={
            <Link
              href={`${campaignNotesPath(campaignShortId)}?beat=${beat.id}`}
            />
          }
          nativeButton={false}
        >
          <NotebookIcon />
          Open notes
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setDeferOpen(true)}
          >
            <ClockCountdownIcon />
            Defer
          </Button>
          {beat.resolved ? (
            <Button variant="ghost" onClick={() => setResolved(false)}>
              <ArrowCounterClockwiseIcon />
              Reopen
            </Button>
          ) : (
            <Button onClick={() => setResolved(true)}>
              <CheckIcon />
              Mark resolved
            </Button>
          )}
        </div>
      </div>
      {deferOpen ? (
        <AlertDialog open onOpenChange={setDeferOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Defer this beat?</AlertDialogTitle>
              <AlertDialogDescription>
                It moves to your prepped shelf and this slot becomes downtime.
                Your notes are kept — run it whenever the party gets there.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setDeferOpen(false)
                  defer()
                }}
              >
                Defer to shelf
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}

/**
 * The inline read-only body (§2's UX delta), collapsible and open by default
 * — this card is the at-table reading surface. Chips render as pills with
 * resolver-current names via {@link ChipProse}.
 */
function BeatNotes({
  body,
  participants,
}: {
  body: string
  participants: ResolvedParticipant[]
}) {
  const [open, setOpen] = useState(true)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 text-xs text-muted-foreground"
          />
        }
      >
        <CaretDownIcon
          className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
        />
        {open ? "Hide notes" : "Show notes"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ChipProse
          participants={participants}
          className="mt-1 rounded-lg border bg-muted/12 px-4 py-3"
        >
          {body}
        </ChipProse>
      </CollapsibleContent>
    </Collapsible>
  )
}
