import { VitalBar } from "@/components/shared/vital-bar"
import type { RailPool } from "@/domain/character/view/rail-view"

/**
 * The rail's HP/SP readout — display-only (design handoff: "No inline editing
 * here"); adjustments live in the controls block below. Values come from the
 * optimistic frame, so a damage dispatch moves both `current` and a derived
 * `max` in the same render.
 */
export function VitalsBlock({
  hp,
  sp,
}: {
  hp: RailPool | null
  sp: RailPool | null
}) {
  if (!hp && !sp) return null

  return (
    <section aria-label="Vitals" className="flex flex-col gap-2.5">
      {hp ? <PoolRow label="HP" kind="hp" pool={hp} /> : null}
      {sp ? <PoolRow label="SP" kind="sp" pool={sp} /> : null}
    </section>
  )
}

function PoolRow({
  label,
  kind,
  pool,
}: {
  label: string
  kind: "hp" | "sp"
  pool: RailPool
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
