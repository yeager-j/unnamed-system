import { SegmentMeter } from "@workspace/ui/components/segment-meter"

import type { RailVictories } from "@/lib/character/view/rail-view"

/**
 * The rail's Victories bar (design handoff): a thin 7-segment gold gauge —
 * visually kin to the Valor gauge, gold rationed per the brand guide — with
 * the `{n} / 7 · {m} to level up` caption. Display-only; awarding lives in the
 * controls block.
 */
export function VictoriesBlock({ view }: { view: RailVictories }) {
  return (
    <section aria-label="Victories" className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-gold uppercase">
          Victories
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">
            {Math.min(view.banked, view.threshold)}
          </span>{" "}
          / {view.threshold}
        </span>
      </div>
      <SegmentMeter
        variant="gold"
        size="sm"
        max={view.threshold}
        value={view.banked}
        label={`${view.banked} of ${view.threshold} victories`}
      />
    </section>
  )
}
