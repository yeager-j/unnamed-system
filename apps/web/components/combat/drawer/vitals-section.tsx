"use client"

import { HeartIcon, SparkleIcon } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"

import { AdjustPoolPopover } from "@/components/shared/adjust-pool-controls"
import { DetailSection } from "@/components/shared/detail-section"
import { VitalBar } from "@/components/shared/vital-bar"
import type { DispatchCombatantWrite } from "@/hooks/use-combatant-write"
import type { CombatantDetail } from "@/lib/combat/view/detail-view"
import type { Pool } from "@/lib/combat/view/roster-view"
import { vitalsAffordances } from "@/lib/combat/view/vitals-affordances"
import type { CombatEntityWrite } from "@/lib/entity/commit/write.schema"
import { COMBATANT_DOWN_LABELS } from "@/lib/ui/labels"

/**
 * The drawer's **VITALS** section, rewritten onto the CD19 write-router
 * (UNN-535). Every adjust dispatches a storage-blind {@link CombatEntityWrite}
 * descriptor through {@link DispatchCombatantWrite} — the router decides the
 * home server-side, the console's optimistic container predicts it against the
 * current frame — so damage/heal work identically on an inline enemy and a
 * **durable PC** (this deliberately supersedes UNN-482's read-only PC vitals,
 * per UNN-535's AC: the DM can adjust a placed PC's HP/SP again, guarded on the
 * character's own `vitalsVersion`).
 *
 * Affordances are gated by {@link vitalsAffordances}, not a kind branch: a
 * pool's damage/heal renders iff the pool **resolved** (`hp`/`sp` non-null),
 * `setMax` is inline-only (a PC's max derives from the engine), and `usePrisma`
 * renders only when `deps.maxPrisma` is resolved — today never, so no Prisma
 * button exists anywhere.
 */
export function CombatantVitalsSection({
  detail,
  dispatchWrite,
}: {
  detail: CombatantDetail
  dispatchWrite: DispatchCombatantWrite
}) {
  const affordances = vitalsAffordances(detail.isPc, detail.deps)

  function write(descriptor: CombatEntityWrite) {
    void dispatchWrite(detail.id, descriptor, detail.deps)
  }

  return (
    <DetailSection title="Vitals">
      <div className="flex flex-col gap-3">
        {detail.hp ? (
          <PoolRow
            label="HP"
            pool={detail.hp}
            kind="hp"
            downBadge={
              detail.isFallen
                ? detail.isPc
                  ? COMBATANT_DOWN_LABELS.pc
                  : COMBATANT_DOWN_LABELS.enemy
                : null
            }
            control={
              <AdjustPoolPopover
                label="Adjust HP"
                icon={<HeartIcon weight="fill" aria-hidden />}
                decrementLabel="Take damage"
                incrementLabel="Heal"
                onDecrement={(amount) =>
                  write({ component: "vitals", op: "damage", amount })
                }
                onIncrement={(amount) =>
                  write({ component: "vitals", op: "heal", amount })
                }
              />
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">No HP to track.</p>
        )}

        {detail.sp ? (
          <PoolRow
            label="SP"
            pool={detail.sp}
            kind="sp"
            control={
              <AdjustPoolPopover
                label="Adjust SP"
                icon={<SparkleIcon aria-hidden />}
                decrementLabel="Spend SP"
                incrementLabel="Recover SP"
                onDecrement={(amount) =>
                  write({ component: "skillPool", op: "damage", amount })
                }
                onIncrement={(amount) =>
                  write({ component: "skillPool", op: "heal", amount })
                }
              />
            }
          />
        ) : null}

        {detail.hp && affordances.setMax ? (
          <MaxHpControl
            hp={detail.hp}
            onSetMax={(amount) =>
              write({ component: "vitals", op: "setMax", amount })
            }
          />
        ) : null}

        {affordances.usePrisma ? (
          <button
            type="button"
            className="text-left text-sm underline"
            onClick={() => write({ component: "resources", op: "usePrisma" })}
          >
            Use Prisma
          </button>
        ) : null}
      </div>
    </DetailSection>
  )
}

/** The inline-only max-HP stepper: `setMax` writes the vitals base absolutely,
 *  so the popover amounts compute the new max from the current one (floored at
 *  1 — the descriptor requires a positive amount). */
function MaxHpControl({
  hp,
  onSetMax,
}: {
  hp: Pool
  onSetMax: (nextMax: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        Max HP <span className="text-foreground tabular-nums">{hp.max}</span>
      </span>
      <AdjustPoolPopover
        label="Adjust max HP"
        icon={<HeartIcon aria-hidden />}
        decrementLabel="Lower max"
        incrementLabel="Raise max"
        onDecrement={(amount) => onSetMax(Math.max(1, hp.max - amount))}
        onIncrement={(amount) => onSetMax(hp.max + amount)}
      />
    </div>
  )
}

/** A pool's readout (label · bar · value + optional Fallen/Dead badge) with an
 *  optional adjust control on the right. */
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
