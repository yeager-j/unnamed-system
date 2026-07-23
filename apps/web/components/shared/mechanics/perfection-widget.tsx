"use client"

import {
  attackBonusForRank,
  PERFECTION_MAX_RANK,
  PERFECTION_RANK_LABELS,
  rankLabel,
  type PerfectionState,
} from "@workspace/game-v2/mechanics/warrior/perfection"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { characterEntityWrite, CharacterRoot } from "@/domain/character/client"

import { WidgetHeader, WidgetStepper } from "./widget-chrome"

/**
 * Warrior — Perfection: the D → S rank track with its Attack-Roll bonus (the
 * bonus folds into every card's `D20 + N` through the resolve fold), plus the
 * owner's step/reset controls.
 */
export function PerfectionWidget({ state }: { state: PerfectionState }) {
  const root = CharacterRoot.useRoot()

  const write = (transition: unknown) =>
    root.mutate(
      characterEntityWrite({
        entityId: root.value.profile.id,
        write: {
          component: "mechanics",
          mechanic: "perfection",
          transition,
        },
      })
    )

  const bonus = attackBonusForRank(state.rank)

  return (
    <>
      <WidgetHeader name="Perfection" value={rankLabel(state.rank)} />
      <div className="flex items-center gap-1">
        {PERFECTION_RANK_LABELS.map((label, index) => (
          <span
            key={label}
            className={cn(
              "flex-1 rounded-sm border py-0.5 text-center text-xs font-semibold",
              index <= state.rank && index > 0
                ? "border-gold/60 text-gold"
                : index === 0 && state.rank === 0
                  ? "border-border text-foreground"
                  : "text-muted-foreground opacity-50"
            )}
          >
            {label}
          </span>
        ))}
      </div>
      {bonus > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{bonus} to Attack Rolls
        </p>
      ) : null}
      <div className="flex items-center justify-between">
        <OwnerOnly>
          <Button
            size="sm"
            variant="ghost"
            disabled={state.rank === 0}
            onClick={() => write({ op: "reset" })}
          >
            Reset
          </Button>
        </OwnerOnly>
        <WidgetStepper
          label="Perfection rank"
          onAdjust={(delta) => write({ op: "adjust", delta })}
          decrementDisabled={state.rank === 0}
          incrementDisabled={state.rank >= PERFECTION_MAX_RANK}
        />
      </div>
    </>
  )
}
