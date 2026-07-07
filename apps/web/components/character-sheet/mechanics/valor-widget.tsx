"use client"

import {
  VALOR_MAX,
  VALOR_THRESHOLD_DESCRIPTIONS,
  VALOR_THRESHOLDS,
  type ValorState,
} from "@workspace/game-v2/mechanics/knight/valor"
import { cn } from "@workspace/ui/lib/utils"

import { useEntityWrite } from "@/hooks/use-entity-write"

import { GoldSegmentBar } from "../rail/gold-segment-bar"
import { WidgetHeader, WidgetStepper } from "./widget-chrome"

/**
 * Knight — Valor (the design's reference widget): the gold 7-segment gauge,
 * the owner's ± stepper (Valor moves with table events — Knight's Protection,
 * opportunity attacks — so the sheet tracks it manually), and the 5-row
 * threshold ladder with rows at or under the current Valor lit and the rest
 * dimmed. The 3+ row is engine-visible (it flips the physical affinities to
 * Resist through the resolve fold); the others are narrative.
 */
export function ValorWidget({ state }: { state: ValorState }) {
  const { dispatch, pending } = useEntityWrite()

  const adjust = (delta: number) =>
    dispatch({
      component: "mechanics",
      mechanic: "valor",
      transition: { op: "adjust", delta },
    })

  return (
    <>
      <WidgetHeader name="Valor" value={`${state.value}/${VALOR_MAX}`} />
      <GoldSegmentBar
        segments={VALOR_MAX}
        filled={state.value}
        label={`${state.value} of ${VALOR_MAX} Valor`}
        size="gauge"
      />
      <WidgetStepper
        label="Valor"
        onAdjust={adjust}
        decrementDisabled={state.value === 0}
        incrementDisabled={state.value >= VALOR_MAX}
        pending={pending}
      />
      <ul className="flex flex-col gap-1">
        {VALOR_THRESHOLDS.map((threshold) => {
          const reached = state.value >= threshold
          return (
            <li
              key={threshold}
              className={cn(
                "flex gap-2 text-xs leading-snug",
                reached ? "text-foreground" : "opacity-40"
              )}
            >
              <span
                className={cn(
                  "w-5 shrink-0 font-semibold tabular-nums",
                  reached && "text-gold"
                )}
              >
                {threshold}+
              </span>
              <span>{VALOR_THRESHOLD_DESCRIPTIONS[threshold]}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
