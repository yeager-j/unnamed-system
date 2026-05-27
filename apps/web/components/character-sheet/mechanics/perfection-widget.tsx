import {
  attackBonusForRank,
  PERFECTION_RANK_LABELS,
  rankLabel,
  type PerfectionState,
} from "@/lib/game/mechanics/perfection"
import { formatSignedBonus } from "@/lib/game/skills/skill-display"

/**
 * Warrior — Perfection rendering. Big current letter (D / C / B / A / S) with
 * every step shown as a ladder beneath it so the player can see how far
 * they've climbed and what's next. The attack bonus the active step grants is
 * called out underneath; below D it reads "no bonus" so the player isn't left
 * staring at "+ 0".
 */
export function PerfectionWidget({ state }: { state: PerfectionState }) {
  const bonus = attackBonusForRank(state.rank)
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        aria-label={`Perfection rank ${rankLabel(state.rank)}`}
        className="font-mono text-6xl leading-none font-bold"
      >
        {rankLabel(state.rank)}
      </div>
      <p className="text-sm text-muted-foreground">
        {bonus > 0 ? (
          <>
            Attack Roll{" "}
            <span className="font-mono text-foreground">
              {formatSignedBonus(bonus)}
            </span>
          </>
        ) : (
          "No Attack Roll bonus yet — land a hit to climb the chain."
        )}
      </p>
      <ol
        className="flex items-center gap-1 font-mono text-xs"
        aria-label="Perfection ladder"
      >
        {PERFECTION_RANK_LABELS.map((label, index) => {
          const isCurrent = index === state.rank
          return (
            <li
              key={label}
              className={
                isCurrent
                  ? "rounded-md border border-foreground bg-foreground px-2 py-0.5 text-background"
                  : "rounded-md border border-border px-2 py-0.5 text-muted-foreground"
              }
            >
              {label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
