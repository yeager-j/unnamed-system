"use client"

import { HeartIcon } from "@phosphor-icons/react/dist/ssr"

import { type CombatantDetail, type Pool } from "@workspace/game/engine"
import {
  isFallen,
  type CombatEvent,
  type EnemyVitalsField,
} from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"

import { AdjustPoolPopover } from "@/components/shared/adjust-pool-controls"
import { DetailSection } from "@/components/shared/detail-section"
import { VitalBar } from "@/components/shared/vital-bar"
import { COMBATANT_DOWN_LABELS } from "@/lib/ui/labels"

type PcDetail = Extract<CombatantDetail, { kind: "pc" }>
type EnemyDetail = Extract<CombatantDetail, { kind: "enemy" }>

/**
 * The drawer's **VITALS** section (UNN-309). A PC's HP/SP is **read-only** here
 * (UNN-482): vitals are character-row state the player owns and manages on their
 * own sheet / the encounter watch — the DM console no longer reaches across that
 * boundary to write them, so this just mirrors the live values (kept fresh by the
 * console's realtime PC-ping path). An enemy's vitals *are* session state, so they
 * stay editable via the `adjustEnemyVitals` event the console dispatches through
 * `onCombatEvent`. Fallen (PC at 0 HP) / Dead (enemy at 0) is derived here.
 */
export function CombatantVitalsSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
}) {
  return (
    <DetailSection title="Vitals">
      {detail.kind === "pc" ? (
        <PcVitalsReadonly detail={detail} />
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

/**
 * A PC's HP/SP, read-only (UNN-482). The player owns these on their character
 * sheet; the console only displays them.
 */
function PcVitalsReadonly({ detail }: { detail: PcDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <PoolRow
        label="HP"
        pool={detail.hp}
        kind="hp"
        downBadge={
          isFallen(detail.hp.current) ? COMBATANT_DOWN_LABELS.pc : null
        }
      />
      <PoolRow label="SP" pool={detail.sp} kind="sp" />
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

/** A pool's readout (label · bar · value + optional Fallen/Dead badge) with an
 *  optional adjust control on the right (omitted for read-only PC vitals). */
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
  control?: React.ReactNode
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
