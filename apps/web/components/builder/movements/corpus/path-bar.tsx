"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { useOptimistic } from "react"
import { toast } from "sonner"

import { getPathStats } from "@workspace/game/engine"
import { PATH_CHOICES, type PathChoice } from "@workspace/game/foundation"
import { Sparkle } from "@workspace/ui/components/celestial"
import { RadioGroup } from "@workspace/ui/components/radio-group"
import { cn } from "@workspace/ui/lib/utils"

import { useBuilderDraft, useBuilderWrite } from "@/hooks/use-builder-draft"
import { updateCharacterPathAction } from "@/lib/actions/character-path"
import { PATH_CHOICE_LABELS } from "@/lib/ui/labels"

/**
 * Per-path die pairing — presentation-only copy not owned by the game engine.
 * `hp` and `sp` are the integer die-face counts (d12 → 12) driving both the
 * displayed die label and the HP-share split rendered in the balance bar.
 * Starting HP / SP come from {@link getPathStats}, the single source of truth.
 */
const PATH_DIE: Record<PathChoice, { hp: number; sp: number }> = {
  "health-focused": { hp: 12, sp: 8 },
  balanced: { hp: 10, sp: 10 },
  "skill-focused": { hp: 8, sp: 12 },
}

function formatDie(die: { hp: number; sp: number }): string {
  return `d${die.hp} / d${die.sp}`
}

/**
 * The Movement 1 Path picker (ADR-002 §"Movement 1 — The Body"). Three
 * segments rendered as a single horizontal bar; selecting one "shifts" the
 * visual accent across the bar to communicate the HP / SP balance. Die pair
 * and starting HP / SP sit underneath each segment so the tradeoff reads at
 * a glance.
 *
 * Persists through the canonical optimistic-toggle dispatch (UNN-180) keyed
 * on `identityVersion`; the action layer is reused as-is from the original
 * radio-card picker.
 */
export function PathBar() {
  const { id: characterId, pathChoice } = useBuilderDraft()
  const { write } = useBuilderWrite()
  const [optimisticPath, setOptimisticPath] = useOptimistic(
    pathChoice,
    (_current: PathChoice, next: PathChoice) => next
  )

  function handleChange(next: PathChoice) {
    if (next === optimisticPath) return
    write({
      surface: "path",
      optimistic: () => setOptimisticPath(next),
      action: (expectedVersion) =>
        updateCharacterPathAction({
          characterId,
          pathChoice: next,
          expectedVersion,
        }),
      messages: {
        stale:
          "Someone else updated this character — refresh to see the latest.",
        error: "Couldn't save your path. Try again.",
      },
      onError: (error) => {
        if (error === "character-not-found") {
          toast.error("This character was deleted.")
          return true
        }
        return false
      },
    })
  }

  const selectedDie = PATH_DIE[optimisticPath]
  const selectedStats = getPathStats(optimisticPath)
  const hpShare = (selectedDie.hp / (selectedDie.hp + selectedDie.sp)) * 100

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-heading text-lg font-medium text-foreground">
        <Sparkle className="size-3 text-gold" />
        Path
      </h2>
      <HpSpBalanceBar
        hpShare={hpShare}
        startHP={selectedStats.startHP}
        startSP={selectedStats.startSP}
      />
      <RadioGroup
        value={optimisticPath}
        onValueChange={(value) => handleChange(value as PathChoice)}
        className="grid w-full grid-cols-1 gap-0 overflow-hidden border border-border sm:grid-cols-3"
      >
        {PATH_CHOICES.map((choice, index) => {
          const isSelected = choice === optimisticPath
          return (
            <RadioPrimitive.Root
              key={choice}
              value={choice}
              className={cn(
                "group/path-segment flex cursor-pointer flex-col items-center gap-1 px-4 py-4 text-center transition-colors outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring",
                index > 0 && "border-t border-border sm:border-t-0 sm:border-l",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-foreground hover:bg-muted"
              )}
            >
              <span className="font-heading text-base font-medium">
                {PATH_CHOICE_LABELS[choice]}
              </span>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  isSelected
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                )}
              >
                {formatDie(PATH_DIE[choice])}
              </span>
            </RadioPrimitive.Root>
          )
        })}
      </RadioGroup>
    </section>
  )
}

/**
 * The "single horizontal bar that shifts" visualization from ADR-002. A two-
 * tone bar whose divider slides between HP (left) and SP (right) as the player
 * picks a Path — Health-Focused pulls the divider right (more HP), Skill-
 * Focused pulls it left (less HP). The animation makes the tradeoff legible at
 * a glance without re-reading the per-segment numbers below.
 *
 * Purely decorative — `aria-hidden`. The segmented `radiogroup` underneath
 * remains the keyboard- and screen-reader-accessible interactive control.
 */
function HpSpBalanceBar({
  hpShare,
  startHP,
  startSP,
}: {
  hpShare: number
  startHP: number
  startSP: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        aria-hidden
        className="relative h-2 w-full overflow-hidden border border-border"
      >
        <div
          className="absolute inset-y-0 left-0 bg-hp transition-[width] duration-300"
          style={{ width: `${hpShare}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-sp transition-[width] duration-300"
          style={{ width: `${100 - hpShare}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between font-mono text-xs text-muted-foreground tabular-nums">
        <span>
          <span className="text-foreground">{startHP}</span> HP
        </span>
        <span>
          <span className="text-foreground">{startSP}</span> SP
        </span>
      </div>
    </div>
  )
}
