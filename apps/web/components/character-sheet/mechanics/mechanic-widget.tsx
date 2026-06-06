"use client"

import { getArchetype } from "@workspace/game/data"
import { getMechanic } from "@workspace/game/engine"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { useCharacter } from "@/hooks/use-character"

import { renderMechanicWidget } from "./widget-registry"

/**
 * The Combat-tab unique-mechanic widget. Renders the active Archetype's
 * mechanic display when one is set; otherwise nothing. Dispatch happens here
 * by mechanic kind — each per-kind widget owns its own state-rendering and
 * shares no shape, by design (mechanics are deliberately heterogeneous).
 *
 * Reads the hydrated character from {@link useCharacter} so callers don't
 * have to prop-drill. Each individual per-kind widget does the same when it
 * needs more than `state` (see Path of Dawn's Luck-derived Lumina cap).
 *
 * Read-only in this slice: no controls, no actions. Edit affordances land
 * with write infrastructure.
 */
export function MechanicWidget() {
  const character = useCharacter()
  const active = character.activeMechanic
  if (!active) return null

  const archetype = character.activeArchetypeKey
    ? getArchetype(character.activeArchetypeKey)
    : undefined
  const mechanic = archetype?.mechanic ? getMechanic(archetype.mechanic) : null
  if (!archetype || !mechanic) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mechanic.displayName}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {archetype.name}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">{mechanic.tagline}</p>
        {renderMechanicWidget(active.state)}
      </CardContent>
    </Card>
  )
}
