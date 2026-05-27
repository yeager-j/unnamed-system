import {
  VALOR_MAX,
  VALOR_THRESHOLD_DESCRIPTIONS,
  VALOR_THRESHOLDS,
  type ValorState,
} from "@/lib/game/mechanics"

/**
 * Knight — Valor rendering. A row of 8 pips (0–7) shows the current score, and
 * a threshold ladder beneath spells out which passive benefits are active.
 * The 3+ threshold's affinity change is engine-applied (visible on the
 * Affinities card); the other thresholds are narrative effects called out here
 * because they aren't modelled as engine data.
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
