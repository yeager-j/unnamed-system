"use client"

import { cva, type VariantProps } from "class-variance-authority"
import type { CSSProperties } from "react"

import { cn } from "@workspace/ui/lib/utils"

const segmentMeterVariants = cva("flex w-full gap-1", {
  variants: {
    size: {
      sm: "h-1.5",
      md: "h-2",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

type SegmentMeterVariant = "primary" | "gold" | "secondary" | "intensity"

/** Static fills for the token-backed variants. */
const FILL_CLASS: Record<Exclude<SegmentMeterVariant, "intensity">, string> = {
  primary: "bg-primary",
  gold: "bg-gold",
  secondary: "bg-foreground/60",
}

/** `intensity`: a per-segment thermometer, hue ramped green→red by position. */
function intensityStyle(index: number, max: number): CSSProperties {
  const t = max <= 1 ? 1 : index / (max - 1)
  const hue = 150 - t * 125
  return { backgroundColor: `oklch(0.7 0.25 ${hue})` }
}

type SegmentMeterProps = {
  value: number
  max: number
  label: string
  variant?: SegmentMeterVariant
  className?: string
} & VariantProps<typeof segmentMeterVariants>

/**
 * A bounded segmented gauge: `max` equal-width segments, the first `value`
 * filled. The one visual for the sheet's "banked resource" bars (Victories,
 * Valor, Frenzy, Virtue ranks, the Spark log). `label` drives the accessible
 * name only — captions are the caller's to compose.
 *
 * Variants set the fill: `primary`, `gold`, and `secondary` are flat token
 * tones; `intensity` colors each filled segment by its position, ramping
 * green→red across the track.
 */
function SegmentMeter({
  value,
  max,
  label,
  variant = "primary",
  size,
  className,
}: SegmentMeterProps) {
  return (
    <div
      data-slot="segment-meter"
      role="meter"
      aria-label={label}
      aria-valuenow={Math.min(value, max)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(segmentMeterVariants({ size, className }))}
    >
      {Array.from({ length: max }, (_, index) => {
        const filled = index < value
        const isIntensity = variant === "intensity"
        return (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-full",
              !filled
                ? "bg-muted"
                : isIntensity
                  ? undefined
                  : FILL_CLASS[variant]
            )}
            style={
              filled && isIntensity ? intensityStyle(index, max) : undefined
            }
          />
        )
      })}
    </div>
  )
}

export { SegmentMeter, segmentMeterVariants, type SegmentMeterProps }
