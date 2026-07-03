import { z } from "zod/v4"

import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
} from "@workspace/game-v2/kernel/vocab/combat"

import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input for {@link import("./start-encounter").startDungeonEncounterAction} — the
 * atomic "Begin" that mints an already-`live` v2 encounter on a delve's shared Map
 * Instance (UNN-536, PR11c). The party + staged enemies are assembled **client-side**
 * (no persisted draft — the delve Instance already exists), so the wire carries the
 * party's `characterId`s and the staged `enemies` (each key placed on a zone), plus
 * the opening `advantage`/`firstSide` the DM declared. `expectedInstanceVersion`
 * guards the shared Instance the co-mint folds enemy tokens onto.
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
  | "character-not-found"
  | "unknown-enemy"
  | "encounter-has-unplaced-combatants"
  | "locator-missing"
  | MapInstanceWriteError
