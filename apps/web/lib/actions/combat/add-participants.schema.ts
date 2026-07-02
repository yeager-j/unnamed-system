import { z } from "zod/v4"

import type { LoadEncounterV2Error } from "@/lib/db/queries/load-encounter-v2"
import type { EncounterWriteError } from "@/lib/db/writes/encounter"

import { encounterMutationBase } from "../encounter/encounter-mutation.schema"

/**
 * Input schema for {@link import("./add-participants").addCatalogEnemiesAction}
 * (UNN-535) — the v2 twin of v1's `AddSetupCombatantsSchema`, narrowed to its
 * one real consumer: the bestiary browser's staged queue (UNN-346), which
 * commits catalog enemies by key + count. Adds land **unplaced** on the enemies
 * side (add-then-place, same as v1's `zoneId: ""`), so this is a session-only
 * write — no Instance token travels. Free-entry and PC adds go through the
 * generic wire's `addParticipant` arm one at a time.
 */
export const AddCatalogEnemiesSchema = encounterMutationBase.extend({
  enemies: z
    .array(
      z.object({
        enemyKey: z.string().min(1),
        count: z.number().int().min(1),
      })
    )
    .min(1),
})

export type AddCatalogEnemiesInput = z.input<typeof AddCatalogEnemiesSchema>

export type AddCatalogEnemiesError =
  | "invalid-input"
  | "unknown-enemy"
  | "locator-missing"
  | LoadEncounterV2Error
  | EncounterWriteError
