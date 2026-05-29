import { z } from "zod/v4"

import type { OriginArchetypePersistenceError } from "@/lib/db/writes/origin-archetype"
import { ORIGIN_ARCHETYPE_KEYS } from "@/lib/game/archetypes"

/**
 * Input schema for {@link setOriginArchetypeAction}. `archetypeKey` is
 * constrained to the initiate-tier catalog keys — only initiates can be an
 * Origin per the rulebook (PRD §5.1), so a tampered request that names an
 * Adept/Elite/Paragon key fails Zod here before it reaches the DB.
 */
export const SetOriginArchetypeSchema = z.object({
  characterId: z.string().min(1),
  archetypeKey: z.enum(ORIGIN_ARCHETYPE_KEYS),
  expectedVersion: z.number().int().nonnegative(),
})

export type SetOriginArchetypeInput = z.input<typeof SetOriginArchetypeSchema>

export type SetOriginArchetypeError =
  | "invalid-input"
  | OriginArchetypePersistenceError
