import { z } from "zod/v4"

import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
} from "@workspace/game-v2/kernel/vocab/combat"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input for {@link import("./start-encounter").startDungeonEncounterAction} — the
 * atomic "Begin" that mints an already-`live` v2 encounter on a delve's shared Map
 * Instance (UNN-536, PR11c). The party + staged enemies are assembled **client-side**
 * (no persisted draft — the delve Instance already exists), so the wire carries the
 * party's `characterId`s and the staged `enemies` (each key placed on a zone), plus
 * the opening `advantage`/`firstSide` the DM declared. The authority locks the
 * shared Instance and folds enemy tokens onto its current state.
 */
/**
 * How many copies of one creature a single staged group may carry. The staging
 * surface enforces the same ceiling on its queue (`useDungeonEnemyQueue`) so the
 * DM can never build a batch this schema would reject — one number, both homes.
 */
export const MAX_STAGED_ENEMY_COUNT = 20

export const StartDungeonEncounterSchema = z.object({
  dungeonId: z.string(),
  /** The dungeon row's optimistic token: combat start is an expedition lifecycle
   *  action (D11, UNN-589), so it version-guards the dungeon row — that bump is
   *  what a racing finish conflicts with. */
  expectedVersion: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(100),
  advantage: z.enum(COMBAT_ADVANTAGES),
  firstSide: z.enum(COMBAT_SIDES),
  partyCharacterIds: z.array(z.string()),
  enemies: z.array(
    z.object({
      enemyKey: z.string(),
      zoneId: z.string(),
      count: z.number().int().min(1).max(MAX_STAGED_ENEMY_COUNT),
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
  | DungeonWriteError
  | MapInstanceWriteError
