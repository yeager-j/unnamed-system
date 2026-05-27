import { z } from "zod/v4"

import type { MechanicDefinition } from "../types"

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
  tagline:
    "Light-damage Skills enter Dawn Mode and apply Lumina counters to struck enemies.",
  description: `Searing light magic rains down on your enemies when you take mercy on your allies. When you use a Skill that deals Light damage, you enter into ***Dawn Mode*** and you apply one ***Lumina*** counter on any enemies that took damage (an enemy with Lumina counters is ***Illuminated***). An enemy can have a maximum number of Lumina equal to your Luck.

An Illuminated enemy cannot turn invisible and it lights up the Zone it occupies with bright light.

When you use a Skill that restores HP or cures Ailments, each Illuminated enemy takes \`1d4\` Light damage per Lumina, which are consumed. Additionally, if you were in Dawn Mode, you recover SP equal to the number of Lumina consumed and you exit Dawn Mode.

When combat ends, all unused Lumina disappear and you exit Dawn Mode.`,
  schema: pathOfDawnStateSchema,
  initialState: () => ({
    kind: "path-of-dawn",
    dawnMode: false,
    enemies: [],
  }),
  resetOn: "encounter",
}
