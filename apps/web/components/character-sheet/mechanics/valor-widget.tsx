"use client"

import {
  VALOR_MAX,
  VALOR_THRESHOLD_DESCRIPTIONS,
  VALOR_THRESHOLDS,
  type ValorState,
} from "@workspace/game/mechanics"

import { OwnerOnly } from "@/components/shell/viewer-role"

import { ValorStepper } from "./knight/valor-stepper"

/**
 * Knight — Valor rendering. A row of 7 pips (0–7) shows the current score
 * with the fraction readout and the owner's +/- stepper alongside; a
 * threshold ladder beneath spells out which passive benefits are active.
 * Only the 3+ threshold is engine-applied (the Affinity card already shows
 * the Slash/Pierce/Strike → Resist change); the others are narrative and
 * not modelled as engine data.
 *
 * Reads `characterId` and `vitalsVersion` from {@link useCharacter} — the
 * widget-registry contract keeps `state` as the only structural prop, and
 * per-widget context lookups match the precedent set by Path of Dawn's
 * Luck-derived cap.
 */
export function ValorWidget({ state }: { state: ValorState }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium" aria-label="Current Valor">
          Valor
        </span>
        <ol className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: VALOR_MAX }, (_, index) => (
            <li
              key={index}
              className={
                index < state.value
                  ? "h-3 w-3 rounded-full bg-foreground"
                  : "h-3 w-3 rounded-full border border-border"
              }
            />
          ))}
        </ol>
        <span className="font-mono text-sm text-muted-foreground">
          {state.value} / {VALOR_MAX}
        </span>
        <OwnerOnly>
          <ValorStepper value={state.value} />
        </OwnerOnly>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {VALOR_THRESHOLDS.map((threshold) => {
          const reached = state.value >= threshold
          return (
            <li
              key={threshold}
              className={
                reached
                  ? "text-foreground"
                  : "text-muted-foreground line-through decoration-muted-foreground/40"
              }
            >
              <span className="mr-2 inline-block w-6 font-mono">
                {threshold}+
              </span>
              {VALOR_THRESHOLD_DESCRIPTIONS[threshold]}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
