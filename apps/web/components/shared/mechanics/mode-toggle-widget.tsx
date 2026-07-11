"use client"

import { getMechanic } from "@workspace/game-v2/mechanics"
import { Switch } from "@workspace/ui/components/switch"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { useEntityWrite } from "@/domain/entity/use-entity-write"

import { WidgetHeader } from "./widget-chrome"

/**
 * The shared mode-flag widget — Path of Dawn and Path of Dusk are the same
 * shape varying the noun: a boolean mode the player toggles, with per-target
 * counters (Lumina / Umbra) tracked at the table. One component, two configs.
 */
export function ModeToggleWidget({
  mechanic,
  modeLabel,
  on,
}: {
  mechanic: "path-of-dawn" | "path-of-dusk"
  modeLabel: string
  on: boolean
}) {
  const { dispatch, pending } = useEntityWrite()
  const definition = getMechanic(mechanic)

  return (
    <>
      <WidgetHeader name={definition?.displayName ?? modeLabel} />
      {definition ? (
        <p className="text-xs text-muted-foreground">{definition.tagline}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{modeLabel}</span>
        <OwnerOnly>
          <Switch
            checked={on}
            disabled={pending}
            onCheckedChange={(value) =>
              dispatch({
                component: "mechanics",
                mechanic,
                transition: { op: "setMode", value },
              })
            }
            aria-label={modeLabel}
          />
        </OwnerOnly>
      </div>
    </>
  )
}
