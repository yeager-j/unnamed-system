"use client"

import { HeartIcon, LightningIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useTransition, type RefObject } from "react"
import { toast } from "sonner"

import { type CombatantDetail, type Pool } from "@workspace/game/engine"
import {
  isFallen,
  type CombatEvent,
  type EnemyVitalsField,
  type Result,
} from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"

import { AdjustPoolPopover } from "@/components/shared/adjust-pool-controls"
import { DetailSection } from "@/components/shared/detail-section"
import {
  damageAction,
  healAction,
  recoverSPAction,
  spendSPAction,
} from "@/lib/actions/adjust-pools"
import type { AdjustPoolActionError } from "@/lib/actions/adjust-pools.schema"
import { COMBATANT_DOWN_LABELS } from "@/lib/ui/labels"

import { VitalBar } from "./vital-bar"

type PcDetail = Extract<CombatantDetail, { kind: "pc" }>
type EnemyDetail = Extract<CombatantDetail, { kind: "enemy" }>

/**
 * The drawer's **VITALS** section (UNN-309) — the one slot that writes a PC's
 * HP/SP through the DM-authorized pools actions (the character row; the player's
 * own sheet updates live). An enemy's vitals mutate the session stat block via
 * the `adjustEnemyVitals` event the console dispatches through `onCombatEvent`
 * (the shared overlay-edit callback). Fallen (PC at 0 HP) / Dead (enemy at 0) is
 * derived here, never stored.
 */
export function CombatantVitalsSection({
  detail,
  onCombatEvent,
  pcVitalsVersions,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
  /** The console-owned per-PC vitals tokens the pools writes share (UNN-373). */
  pcVitalsVersions: RefObject<Record<string, number>>
}) {
  return (
    <DetailSection title="Vitals">
      {detail.kind === "pc" ? (
        <PcVitals detail={detail} pcVitalsVersions={pcVitalsVersions} />
      ) : (
        <EnemyVitals
          detail={detail}
          onAdjust={(combatantId, field, value) =>
            onCombatEvent({
              kind: "adjustEnemyVitals",
              combatantId,
              field,
              value,
            })
          }
        />
      )}
    </DetailSection>
  )
}

function poolErrorMessage(error: AdjustPoolActionError): string {
  switch (error) {
    case "stale":
      return "This character changed elsewhere — reload and try again."
    case "character-not-found":
      return "This character no longer exists."
    case "invalid-input":
    case "non-positive-amount":
      return "Couldn't update vitals. Try again."
  }
}

/**
 * PC vitals via the pools actions. The console has no `CharacterProvider`; the
 * vitals token lives in the console-owned `pcVitalsVersions` map (UNN-373) so
 * the realtime ping compare and these writes read/bump the *same* value — a
 * rapid second click sees the fresh token, and the write's own echo ping
 * arrives ≤ the map and is dropped. The map is prop-synced (forward-only) by
 * `useCombatConsole`; the hydrated prop is the fallback for a PC the map
 * hasn't seen yet.
 */
function PcVitals({
  detail,
  pcVitalsVersions,
}: {
  detail: PcDetail
  pcVitalsVersions: RefObject<Record<string, number>>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(
    action: (input: {
      characterId: string
      amount: number
      expectedVersion: number
    }) => Promise<Result<{ version: number }, AdjustPoolActionError>>,
    amount: number
  ) {
    startTransition(async () => {
      const result = await action({
        characterId: detail.characterId,
        amount,
        expectedVersion:
          pcVitalsVersions.current[detail.characterId] ?? detail.vitalsVersion,
      })
      if (!result.ok) {
        toast.error(poolErrorMessage(result.error))
        return
      }
      pcVitalsVersions.current[detail.characterId] = result.value.version
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <PoolRow
        label="HP"
        pool={detail.hp}
        kind="hp"
        downBadge={
          isFallen(detail.hp.current) ? COMBATANT_DOWN_LABELS.pc : null
        }
        control={
          <AdjustPoolPopover
            label="Adjust HP"
            icon={<HeartIcon weight="fill" aria-hidden />}
            decrementLabel="Take damage"
            incrementLabel="Heal"
            disabled={pending}
            onDecrement={(amount) => run(damageAction, amount)}
            onIncrement={(amount) => run(healAction, amount)}
          />
        }
      />
      <PoolRow
        label="SP"
        pool={detail.sp}
        kind="sp"
        control={
          <AdjustPoolPopover
            label="Adjust SP"
            icon={<LightningIcon weight="fill" aria-hidden />}
            decrementLabel="Spend SP"
            incrementLabel="Recover SP"
            disabled={pending}
            onDecrement={(amount) => run(spendSPAction, amount)}
            onIncrement={(amount) => run(recoverSPAction, amount)}
          />
        }
      />
    </div>
  )
}

/**
 * Enemy vitals via the `adjustEnemyVitals` event (absolute set). Damage/heal and
 * max edits compute the new absolute from the popover amount; the reducer floors
 * max at 0. Works the same for inline and catalog enemies — a catalog enemy's
 * working HP lives inline on its ref, defaulting to the definition's max
 * (UNN-309). No SP control: enemy stat blocks carry no SP.
 */
function EnemyVitals({
  detail,
  onAdjust,
}: {
  detail: EnemyDetail
  onAdjust: (
    combatantId: string,
    field: EnemyVitalsField,
    value: number
  ) => void
}) {
  const { id, hp } = detail

  return (
    <div className="flex flex-col gap-3">
      <PoolRow
        label="HP"
        pool={hp}
        kind="hp"
        downBadge={isFallen(hp.current) ? COMBATANT_DOWN_LABELS.enemy : null}
        control={
          <AdjustPoolPopover
            label="Adjust HP"
            icon={<HeartIcon weight="fill" aria-hidden />}
            decrementLabel="Take damage"
            incrementLabel="Heal"
            disabled={false}
            onDecrement={(amount) =>
              onAdjust(id, "currentHP", hp.current - amount)
            }
            onIncrement={(amount) =>
              onAdjust(id, "currentHP", Math.min(hp.max, hp.current + amount))
            }
          />
        }
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Max HP <span className="text-foreground tabular-nums">{hp.max}</span>
        </span>
        <AdjustPoolPopover
          label="Adjust max HP"
          icon={<HeartIcon aria-hidden />}
          decrementLabel="Lower max"
          incrementLabel="Raise max"
          disabled={false}
          onDecrement={(amount) =>
            onAdjust(id, "maxHP", Math.max(0, hp.max - amount))
          }
          onIncrement={(amount) => onAdjust(id, "maxHP", hp.max + amount)}
        />
      </div>
    </div>
  )
}

/** A pool's readout (label · bar · value + optional Fallen/Dead badge) with its
 *  adjust control on the right. */
function PoolRow({
  label,
  pool,
  kind,
  control,
  downBadge,
}: {
  label: string
  pool: Pool
  kind: "hp" | "sp"
  control: React.ReactNode
  downBadge?: string | null
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {downBadge ? <Badge variant="destructive">{downBadge}</Badge> : null}
          <span className="text-xs text-muted-foreground tabular-nums">
            {pool.current} / {pool.max}
          </span>
        </span>
        {control}
      </div>
      <VitalBar current={pool.current} max={pool.max} kind={kind} />
    </div>
  )
}
