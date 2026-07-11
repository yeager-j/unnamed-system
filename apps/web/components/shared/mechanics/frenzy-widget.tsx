"use client"

import {
  FRENZY_DAMAGE_DIE,
  FRENZY_PAIN_MAX,
  type FrenzyState,
} from "@workspace/game-v2/mechanics/berserker/frenzy"
import { SegmentMeter } from "@workspace/ui/components/segment-meter"
import { Switch } from "@workspace/ui/components/switch"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { useEntityWrite } from "@/hooks/use-entity-write"

import { WidgetHeader, WidgetStepper } from "./widget-chrome"

/**
 * Berserker — Frenzy: the 0–5 Pain meter and the Frenzy Mode switch. Entering
 * Frenzy needs at least 1 Pain (the engine transition enforces it — the switch
 * disables at 0), and Pain hitting 0 forces Frenzy off server-side; while
 * frenzied, physical damage gains +1d4 per Pain (folded into the skill cards'
 * damage ladders by the resolve fold).
 */
export function FrenzyWidget({ state }: { state: FrenzyState }) {
  const { dispatch, pending } = useEntityWrite()

  const write = (transition: unknown) =>
    dispatch({ component: "mechanics", mechanic: "frenzy", transition })

  return (
    <>
      <WidgetHeader
        name="Frenzy"
        value={`Pain ${state.pain}/${FRENZY_PAIN_MAX}`}
      />
      <SegmentMeter
        variant="intensity"
        size="md"
        max={FRENZY_PAIN_MAX}
        value={state.pain}
        label={`${state.pain} of ${FRENZY_PAIN_MAX} Pain`}
      />
      <WidgetStepper
        label="Pain"
        onAdjust={(delta) => write({ op: "adjustPain", delta })}
        decrementDisabled={state.pain === 0}
        incrementDisabled={state.pain >= FRENZY_PAIN_MAX}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">
          Frenzy Mode
          {state.frenzyMode ? (
            <span className="text-muted-foreground">
              {" "}
              · +{state.pain}d{FRENZY_DAMAGE_DIE} physical
            </span>
          ) : null}
        </span>
        <OwnerOnly>
          <Switch
            checked={state.frenzyMode}
            disabled={pending || (!state.frenzyMode && state.pain === 0)}
            onCheckedChange={(value) => write({ op: "setFrenzyMode", value })}
            aria-label="Frenzy Mode"
          />
        </OwnerOnly>
      </div>
    </>
  )
}
