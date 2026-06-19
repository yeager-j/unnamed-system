import { z } from "zod/v4"

import { COMBAT_ADVANTAGES, COMBAT_SIDES } from "@workspace/game/foundation"

import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input schema for {@link import("./start-dungeon-encounter").startDungeonEncounterAction}
 * (UNN-467) — the combat-on-the-dungeon gesture. The DM stages the roster
 * client-side in the run console's Setup phase (nothing persisted until Begin),
 * then this commits it as an already-`live` encounter on the **delve's own** Map
 * Instance, atomically (`guardMany`): the chosen party + the staged enemies, the
 * declared advantage/first side, and the enemy occupancy tokens.
 *
 * `partyCharacterIds` are the placed PCs the DM kept in the fight — each becomes a
 * combatant keyed by its `characterId` (so the exploration token already on the
 * Instance *is* the combat token, no duplicate). `enemies` are catalog picks,
 * each expanded `count` times into a `catalog-enemy` combatant placed in `zoneId`.
 * `expectedInstanceVersion` guards the shared Instance — combat-start writes the
 * Instance row (enemy tokens) and inserts the encounter together.
 */
export const StartDungeonEncounterSchema = z.object({
  dungeonId: z.string(),
  expectedInstanceVersion: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(100),
  advantage: z.enum(COMBAT_ADVANTAGES),
  firstSide: z.enum(COMBAT_SIDES),
  partyCharacterIds: z.array(z.string()),
  enemies: z.array(
    z.object({
      enemyKey: z.string(),
      zoneId: z.string(),
      count: z.number().int().min(1).max(20),
    })
  ),
})

export type StartDungeonEncounterInput = z.input<
  typeof StartDungeonEncounterSchema
>

export type StartDungeonEncounterError =
  | "invalid-input"
  | "dungeon-not-found"
  | "delve-not-active"
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"
  | MapInstanceWriteError
