import { cn } from "@workspace/ui/lib/utils"

/**
 * A segmented gold gauge — the one visual for "banked marquee resource"
 * (Victories, Valor), so the two read as kin (design handoff). Filled
 * segments carry the gold token; empty ones sit muted.
 */
export function GoldSegmentBar({
  segments,
  filled,
  label,
  size = "thin",
}: {
  segments: number
  filled: number
  label: string
  size?: "thin" | "gauge"
}) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.min(filled, segments)}
      aria-valuemin={0}
      aria-valuemax={segments}
      className={cn("flex w-full gap-1", size === "thin" ? "h-1.5" : "h-2")}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className={cn(
            "flex-1 rounded-full",
            index < filled ? "bg-gold" : "bg-muted"
          )}
        />
      ))}
    </div>
  )
}
