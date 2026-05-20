import { z } from "zod/v4"
import type { MechanicDefinition } from "./types"

/**
 * Healer — Path of Dawn. Light-damage Skills apply Lumina counters to enemies
 * (entering Dawn Mode); HP-restoring or Ailment-curing Skills consume Lumina
 * for Light damage and SP refund (rulebook `Skills/Mechanics/Path of Dawn.md`).
 *
 * State holds the Dawn Mode flag and the per-enemy Lumina counters. The cap
 * per enemy is the character's Luck score. Cap, consumption, and counter
 * application all happen in Skill-cast write paths — out of MVP scope; this
 * module just owns the persisted shape and exposes the cap helper for the
 * (read-only) widget.
 *
 * The inline enemy list is a placeholder. When the initiative tracker lands,
 * Lumina counters move there and reference initiative entries instead of
 * carrying their own enemy name.
 */

export const pathOfDawnEnemySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lumina: z.number().int().min(0),
})

export type PathOfDawnEnemy = z.infer<typeof pathOfDawnEnemySchema>

export const pathOfDawnStateSchema = z.object({
  kind: z.literal("path-of-dawn"),
  dawnMode: z.boolean(),
  enemies: z.array(pathOfDawnEnemySchema),
})

export type PathOfDawnState = z.infer<typeof pathOfDawnStateSchema>

/**
 * Per-enemy Lumina cap, equal to the character's post-Effect Luck score
 * (clamped at 0). Takes Luck directly rather than the engine input so this
 * module stays free of compute-pipeline dependencies — the caller resolves
 * Luck off the hydrated character.
 */
export function luminaCapFor(luck: number): number {
  return Math.max(0, luck)
}

export const pathOfDawn: MechanicDefinition<PathOfDawnState> = {
  kind: "path-of-dawn",
  displayName: "Path of Dawn",
  schema: pathOfDawnStateSchema,
  initialState: () => ({
    kind: "path-of-dawn",
    dawnMode: false,
    enemies: [],
  }),
  resetOn: "encounter",
}
