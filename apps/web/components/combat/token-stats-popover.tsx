"use client"

import type { ComponentProps, ReactNode } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { CombatStateDisplay } from "@/components/combat/conditions/state-display"
import { VitalBar } from "@/components/shared/vital-bar"
import type { Pool } from "@/domain/combat/view/pool"

/**
 * A tap-to-expand read-only stats card for a map token (UNN-490): numeric HP/SP
 * plus — during a fight — the combatant's ailments and battle conditions, the
 * expanded readout behind the token's at-a-glance {@link VitalBar}s. Rendered on
 * the player fog view's tokens (exploration + delve combat); the DM keeps the
 * editable {@link import("@/components/combat/drawer/combatant-drawer").CombatantDrawer}.
 *
 * Presentational and route-agnostic: the caller passes the token chip as
 * `children` (it becomes the trigger) and the already-redacted stats as props.
 * `conditions` is absent in exploration (no combat overlay exists), so the card
 * shows HP/SP alone there; its type is borrowed from {@link CombatStateDisplay}
 * so this kit file needs no engine import of its own.
 */
export function TokenStatsPopover({
  name,
  hp,
  sp,
  conditions,
  children,
}: {
  name: string
  hp: Pool | null
  sp: Pool | null
  conditions?: ComponentProps<typeof CombatStateDisplay>
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${name} stats`}
        className="pointer-events-auto cursor-pointer rounded-none outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="gap-3">
        <PopoverTitle className="truncate">{name}</PopoverTitle>

        {hp || sp ? (
          <section aria-label="Vitals" className="flex flex-col gap-2.5">
            {hp ? <PoolRow label="HP" kind="hp" pool={hp} /> : null}
            {sp ? <PoolRow label="SP" kind="sp" pool={sp} /> : null}
          </section>
        ) : null}

        {conditions ? <CombatStateDisplay {...conditions} /> : null}
      </PopoverContent>
    </Popover>
  )
}

function PoolRow({
  label,
  kind,
  pool,
}: {
  label: string
  kind: "hp" | "sp"
  pool: Pool
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span
          className={
            kind === "hp"
              ? "text-xs font-semibold text-hp"
              : "text-xs font-semibold text-sp"
          }
        >
          {label}
        </span>
        <span className="text-sm tabular-nums">
          {pool.current} / {pool.max}
        </span>
      </div>
      <VitalBar current={pool.current} max={pool.max} kind={kind} />
    </div>
  )
}
