import {
  ArrowCounterClockwiseIcon,
  ArrowUpRightIcon,
  CastleTurretIcon,
  CheckCircleIcon,
  CheckIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useTransition } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import type { RunnerDungeonView } from "@/domain/planner/view/runner"
import {
  setDungeonSlotResolvedAction,
  unclaimDungeonSlotAction,
} from "@/lib/actions/campaign-clock/dungeon-claim"
import { dungeonConsolePath } from "@/lib/paths"

import { runnerErrorToast } from "./runner-errors"

/**
 * The runner's **dungeon slot card** (UNN-577, tech-design D9): the claimed
 * dungeon's name, "Open dungeon console" into the existing delve surface,
 * **Mark resolved / Reopen** on the claim, and **Remove** (unclaim — the
 * slot reverts to downtime; no confirm, nothing is lost and set-aside
 * entries simply resurface). Coupling stays one-directional: nothing here
 * touches the dungeon's own status, and the console never touches the clock.
 * A delve that runs long is extended by claiming the next slot with the same
 * dungeon from the "Run a dungeon" menu.
 */
export function DungeonSlotCard({
  campaignId,
  campaignShortId,
  dungeon,
  slotId,
  onResolved,
}: {
  campaignId: string
  campaignShortId: string
  dungeon: RunnerDungeonView
  slotId: string
  /** Fired after a successful Mark resolved — the runner advances the rail. */
  onResolved: () => void
}) {
  const [, startTransition] = useTransition()

  const setResolved = (resolved: boolean) =>
    startTransition(async () => {
      const result = await setDungeonSlotResolvedAction({
        campaignId,
        slotId,
        resolved,
      })
      if (!result.ok) return runnerErrorToast(result.error)
      if (resolved) onResolved()
    })

  const remove = () =>
    startTransition(async () => {
      const result = await unclaimDungeonSlotAction({ campaignId, slotId })
      if (!result.ok) runnerErrorToast(result.error)
    })

  return (
    <div className="mx-auto w-full max-w-2xl rounded-[calc(var(--radius)+4px)] border bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Dungeon
        </span>
        {dungeon.resolved ? (
          <Badge variant="outline" className="gap-1 text-xs">
            <CheckCircleIcon className="size-3.5 text-primary-text" />
            Delve resolved
          </Badge>
        ) : null}
      </div>
      <h2 className="mt-2 flex items-center gap-2 font-display text-2xl text-foreground">
        <CastleTurretIcon className="size-6 shrink-0 text-gold" />
        {dungeon.name}
      </h2>
      <p className="mt-2 text-base text-muted-foreground">
        The delve takes this slot. If the party runs long, claim the next slot
        with the same dungeon.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
        <Button
          variant="outline"
          render={
            <Link href={dungeonConsolePath(campaignShortId, dungeon.shortId)} />
          }
          nativeButton={false}
        >
          Open dungeon console
          <ArrowUpRightIcon />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={remove}
          >
            <XIcon />
            Remove
          </Button>
          {dungeon.resolved ? (
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
    </div>
  )
}
