"use client"

import type { MechanicKind } from "@workspace/game-v2/kernel/vocab/mechanics"
import { getMechanic } from "@workspace/game-v2/mechanics"

import { WidgetHeader } from "./widget-chrome"

/**
 * The card for mechanics whose state lives at the table (Tells, planted
 * Weaknesses, Zone Enchantments): name + tagline as a reference, no controls —
 * the sheet is a tracker, and there is nothing durable to track.
 */
export function DisplayOnlyWidget({ kind }: { kind: MechanicKind }) {
  const definition = getMechanic(kind)
  if (!definition) return null

  return (
    <>
      <WidgetHeader name={definition.displayName} />
      <p className="text-xs text-muted-foreground">{definition.tagline}</p>
    </>
  )
}
