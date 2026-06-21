import { z } from "zod/v4"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"
import type { MapInstanceWriteError } from "@/lib/db/writes/map-instance"

/**
 * Input schema for {@link import("./end-dungeon-combat").endDungeonCombatAction}
 * (UNN-469) — the inverse of {@link import("./start-dungeon-encounter").startDungeonEncounterAction}.
 * Ending a fight on the dungeon is a three-container gesture committed atomically
 * (`guardMany`): the Encounter flips to `ended`, the shared Map Instance is pruned
 * of the fight's combat-scoped state (enemy tokens + engagement + enchantment;
 * PC tokens persist where they ended), and the Dungeon turn the fight consumed is
 * advanced. Each row carries its own optimistic-concurrency token so a partial
 * failure rolls back all three.
 */
export const EndDungeonCombatSchema = z.object({
  encounterId: z.string(),
  dungeonId: z.string(),
  expectedEncounterVersion: z.number().int().nonnegative(),
  expectedInstanceVersion: z.number().int().nonnegative(),
  expectedDungeonVersion: z.number().int().nonnegative(),
})

export type EndDungeonCombatInput = z.input<typeof EndDungeonCombatSchema>

export type EndDungeonCombatError =
  | "invalid-input"
  | "dungeon-not-found"
  | "encounter-not-found"
  | "encounter-not-live"
  | "encounter-not-on-dungeon"
  | EncounterWriteError
  | MapInstanceWriteError
  | DungeonWriteError
