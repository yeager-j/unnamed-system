"use client"

import { OwnerOnly, useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter } from "@/hooks/use-character"
import {
  attackBonusForRank,
  PERFECTION_RANK_LABELS,
  rankLabel,
  type PerfectionState,
} from "@/lib/game/mechanics"
import { formatSignedBonus } from "@/lib/game/skills"

import { usePerfectionControls } from "./warrior/perfection-controls"

/**
 * Warrior — Perfection rendering. Big current letter (D / C / B / A / S)
 * with every step shown as a ladder beneath it so the player can see how
 * far they've climbed and what's next. The Attack Roll bonus the active
 * step grants is called out underneath; below D it reads "no bonus" so
 * the player isn't left staring at "+ 0".
 *
 * Owner mode (UNN-228) adds step `−` / `+` controls between the bonus
 * text and the ladder, plus a labelled "Reset to D" beneath. Optimistic
 * rank state lives in the {@link usePerfectionControls} hook so the big
 * letter, bonus text, and ladder all reflect the in-flight value before
 * the server response lands.
 */
export function PerfectionWidget({ state }: { state: PerfectionState }) {
  const character = useCharacter()
  const role = useViewerRole()

  const controls = usePerfectionControls({
    characterId: character.id,
    rank: state.rank,
    vitalsVersion: character.vitalsVersion,
  })

  const displayRank = role === "owner" ? controls.optimisticRank : state.rank
  const bonus = attackBonusForRank(displayRank)

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        aria-label={`Perfection rank ${rankLabel(displayRank)}`}
        className="font-mono text-6xl leading-none font-bold"
      >
        {rankLabel(displayRank)}
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
      <OwnerOnly>{controls.stepButtons}</OwnerOnly>
      <ol
        className="flex items-center gap-1 font-mono text-xs"
        aria-label="Perfection ladder"
      >
        {PERFECTION_RANK_LABELS.map((label, index) => {
          const isCurrent = index === displayRank
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
      <OwnerOnly>{controls.resetButton}</OwnerOnly>
    </div>
  )
}
