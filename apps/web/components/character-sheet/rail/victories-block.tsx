import type { RailVictories } from "@/lib/character/view/rail-view"

import { GoldSegmentBar } from "./gold-segment-bar"

/**
 * The rail's Victories bar (design handoff): a thin 7-segment gold gauge —
 * visually kin to the Valor gauge, gold rationed per the brand guide — with
 * the `{n} / 7 · {m} to level up` caption. Display-only; awarding lives in the
 * controls block.
 */
export function VictoriesBlock({ view }: { view: RailVictories }) {
  const caption = view.atMaxLevel
    ? "Max level"
    : view.canLevelUp
      ? "Ready to level up"
      : `${view.toNext} to level up`

  return (
    <section aria-label="Victories" className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-gold">Victories</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.min(view.banked, view.threshold)} / {view.threshold} · {caption}
        </span>
      </div>
      <GoldSegmentBar
        segments={view.threshold}
        filled={view.banked}
        label={`${view.banked} of ${view.threshold} victories`}
        size="thin"
      />
    </section>
  )
}
