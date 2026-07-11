"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { OwnerOnly } from "@/components/shell/viewer-role"
import type { RailExhaustion } from "@/domain/character/view/rail-view"
import { useEntityWrite } from "@/hooks/use-entity-write"

/**
 * The rail's Exhaustion tracker (D27; rulebook 2.5) — the one combat-adjacent
 * state that genuinely persists between fights, so it keeps a sheet control
 * (CH8 removed the encounter-overlay togglers, not this). A 0–6 stepper
 * dispatching `exhaustion.setLevel`; a Full Rest steps it down by one on its
 * own.
 */
export function ExhaustionBlock({ view }: { view: RailExhaustion }) {
  const { dispatch } = useEntityWrite()

  const setLevel = (level: number) =>
    dispatch({ component: "exhaustion", op: "setLevel", level })

  return (
    <section
      aria-label="Exhaustion"
      className="flex items-center justify-between gap-2 rounded-md border bg-background/60 px-2.5 py-2"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-semibold">Exhaustion</span>
        <span
          className={cn(
            "text-xs",
            view.level > 0 ? "text-destructive" : "text-muted-foreground"
          )}
        >
          Level {view.level}
        </span>
      </div>
      <OwnerOnly>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Decrease exhaustion"
            disabled={view.level === 0}
            onClick={() => setLevel(view.level - 1)}
          >
            <MinusIcon aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Increase exhaustion"
            disabled={view.level >= view.max}
            onClick={() => setLevel(view.level + 1)}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
      </OwnerOnly>
    </section>
  )
}
