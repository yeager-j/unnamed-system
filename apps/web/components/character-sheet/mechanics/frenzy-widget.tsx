"use client"

import { FlameIcon, WarningDiamondIcon } from "@phosphor-icons/react"

import { FRENZY_PAIN_MAX, type FrenzyState } from "@workspace/game/foundation"
import { cn } from "@workspace/ui/lib/utils"

import { OwnerOnly, useViewerRole } from "@/components/shell/viewer-role"

import { FrenzyToggle } from "./berserker/frenzy-toggle"
import { PainStepper } from "./berserker/pain-stepper"

/**
 * Berserker — Frenzy rendering. A segmented Pain Meter (0–{@link FRENZY_PAIN_MAX})
 * fills green→red as Pain builds, with the owner's +/- stepper alongside; the
 * Frenzy Mode control sits beneath (an owner toggle, a viewer badge), and a list
 * of Frenzy-Mode benefits lights up while in Mode. The "+1d4 Physical per Pain"
 * bonus is also surfaced live on the Skill cards (the engine emits it as a
 * DamageEffect). When in Frenzy the whole widget takes a red ring for an
 * at-a-glance read.
 */
const PAIN_SEGMENT_COLORS = [
  "bg-lime-500",
  "bg-yellow-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-red-600",
] as const

export function FrenzyWidget({ state }: { state: FrenzyState }) {
  const role = useViewerRole()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <FlameIcon className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">LOOK AT ME!</span>{" "}
              You can take an opportunity attack against Engaged creatures who
              don&apos;t target you.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <WarningDiamondIcon className="mt-0.5 shrink-0" aria-hidden />
            <span>If you receive healing, your Pain drops to 0.</span>
          </li>
        </ul>
      </div>

      <div
        className={cn(
          "flex flex-col gap-4 p-3 transition-colors",
          state.frenzyMode && "bg-red-500/[0.04] ring-1 ring-red-500/30"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" aria-label="Current Pain">
            Pain
          </span>
          <ol className="flex flex-1 items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: FRENZY_PAIN_MAX }, (_, index) => (
              <li
                key={index}
                className={cn(
                  "h-2.5 flex-1",
                  index < state.pain
                    ? PAIN_SEGMENT_COLORS[index]
                    : "border border-border"
                )}
              />
            ))}
          </ol>
          <span className="font-mono text-sm text-muted-foreground">
            {state.pain} / {FRENZY_PAIN_MAX}
          </span>
          <OwnerOnly>
            <PainStepper value={state.pain} />
          </OwnerOnly>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Frenzy Mode</span>
          {role === "owner" ? (
            <FrenzyToggle
              frenzyMode={state.frenzyMode}
              disabled={state.pain === 0}
            />
          ) : (
            <FrenzyBadge frenzyMode={state.frenzyMode} />
          )}
        </div>
      </div>
    </div>
  )
}

function FrenzyBadge({ frenzyMode }: { frenzyMode: boolean }) {
  return (
    <span
      aria-label={frenzyMode ? "Frenzy Mode active" : "Frenzy Mode off"}
      className={
        frenzyMode
          ? "inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-sm font-medium text-red-700 dark:text-red-300"
          : "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground"
      }
    >
      <FlameIcon weight={frenzyMode ? "fill" : "bold"} aria-hidden />
      {frenzyMode ? "Frenzy Mode" : "Inactive"}
    </span>
  )
}
