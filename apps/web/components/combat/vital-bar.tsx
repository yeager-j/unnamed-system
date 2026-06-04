import { cn } from "@workspace/ui/lib/utils"

/**
 * A thin HP/SP bar for the combatant rail. The shared {@link Progress} primitive
 * is single-color (`bg-primary`) and exposes no indicator-class passthrough, so
 * this small bar owns its fill color: SP rides the `sp` token, HP the `hp` token
 * until it drops to a third or less — where it flips to `destructive` so a
 * combatant in danger reads at a glance (matching the design's red low-HP bars).
 */
export function VitalBar({
  current,
  max,
  kind,
}: {
  current: number
  max: number
  kind: "hp" | "sp"
}) {
  const ratio = max > 0 ? current / max : 0
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  const low = kind === "hp" && ratio <= 1 / 3
  const fill = kind === "sp" ? "bg-sp" : low ? "bg-destructive" : "bg-hp"

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-none bg-muted"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn("h-full transition-all", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
