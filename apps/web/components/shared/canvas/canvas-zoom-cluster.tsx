"use client"

import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useReactFlow, useViewport } from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { prefersReducedMotion } from "@/components/shared/canvas/reduced-motion"
import {
  TIER_MIDPOINTS,
  tierOfZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  type ZoneTier,
} from "@/components/shared/canvas/tier"

const TIER_LABELS: { tier: ZoneTier; label: string }[] = [
  { tier: "marquee", label: "Marquee" },
  { tier: "stage", label: "Stage" },
  { tier: "closeup", label: "Closeup" },
]

const clamp = (pct: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pct))

/**
 * The **grown** zoom cluster shared by every React Flow bar (Dungeon Visual
 * Overhaul §D8) — the dungeon turn-loop / setup / combat bars, the Map editor
 * toolbar, and the player watch bar. It replaced the plain −/fit/+ trio with the
 * semantic-zoom vocabulary: `−`/`+` buttons flanking a range slider, with
 * Marquee/Stage/Closeup **shortcut** labels beneath it (the buttons centre on the
 * whole slider-plus-labels group, not the slider alone).
 *
 * Tier is always **derived** from zoom, never selected (§D1): the highlighted label
 * reads `tierOfZoom`; the labels only *jump* zoom to a band midpoint. Reads the
 * viewport off {@link useReactFlow} / {@link useViewport} internally; the caller
 * supplies the `TooltipProvider` and any flanking `Separator`.
 */
export function CanvasZoomCluster() {
  const { zoomTo } = useReactFlow()
  const { zoom } = useViewport()
  const duration = prefersReducedMotion() ? 0 : 200

  const pct = Math.round(zoom * 100)
  const tier = tierOfZoom(pct)

  const setPct = (next: number, animate = false) =>
    void zoomTo(clamp(next) / 100, { duration: animate ? duration : 0 })

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom out"
              onClick={() => setPct(pct - ZOOM_STEP, true)}
            />
          }
        >
          <MagnifyingGlassMinusIcon />
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>

      <div className="flex flex-col items-center gap-3">
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={1}
          value={pct}
          aria-label="Zoom"
          onChange={(event) => setPct(Number(event.target.value))}
          className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-muted [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
        />

        <div className="flex w-40 justify-between text-[10px] tracking-wide">
          {TIER_LABELS.map(({ tier: value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPct(TIER_MIDPOINTS[value], true)}
              className={cn(
                "cursor-pointer text-muted-foreground transition-colors hover:text-foreground",
                tier === value && "font-bold text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Zoom in"
              onClick={() => setPct(pct + ZOOM_STEP, true)}
            />
          }
        >
          <MagnifyingGlassPlusIcon />
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>
    </div>
  )
}
