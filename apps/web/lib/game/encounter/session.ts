import { z } from "zod/v4"

import { BATTLE_CONDITION_AXIS_KEYS } from "@/lib/game/character"

/**
 * The immutable state the initiative tracker's reducer operates over — the
 * combat-temporal and spatial bookkeeping the durationless character model
 * deliberately doesn't hold (UNN-291). PCs are referenced by `characterId` so
 * the character row stays the single source of truth for HP/SP/ailments/
 * battle-conditions; only combat-temporal state (turn position, per-axis
 * durations) and the Zone overlay live on the session. This module is the
 * shape, schema, and constructor only — reducer behavior is UNN-292 and DB
 * serialization is UNN-296.
 */

/**
 * PROVISIONAL inline stat block for a free-entered enemy/NPC combatant. The
 * real shape is finalized in UNN-299 (Free-entry enemy/NPC combatants) — keep
 * call sites thin and expect this to gain fields (e.g. affinities). Captures
 * only the free-enter essentials the PRD §1 lists so a representative session
 * is valid today.
 */
export const enemyStatBlockSchema = z.object({
  name: z.string().min(1),
  maxHP: z.number().int().nonnegative(),
  currentHP: z.number().int(),
  maxSP: z.number().int().nonnegative(),
  currentSP: z.number().int(),
  attributes: z.object({
    strength: z.number().int(),
    magic: z.number().int(),
    agility: z.number().int(),
    luck: z.number().int(),
  }),
  notes: z.string().optional(),
})
export type EnemyStatBlock = z.infer<typeof enemyStatBlockSchema>

/**
 * The two sides a combatant can belong to. A PC is not pinned to `players` — a
 * charmed PC or a summoned NPC ally can sit on either side — so `side` is
 * orthogonal to whether a combatant is a PC or a free-entered enemy.
 */
export const COMBAT_SIDES = ["players", "enemies"] as const
export type CombatSide = (typeof COMBAT_SIDES)[number]

/**
 * How a combatant's live state is sourced: a `pc` defers to its character row
 * (HP/SP/ailments/battle-conditions written through the existing combat-state
 * actions), while an `enemy` carries an inline {@link EnemyStatBlock}.
 */
const combatantRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pc"), characterId: z.string() }),
  z.object({ kind: z.literal("enemy"), statBlock: enemyStatBlockSchema }),
])
export type CombatantRef = z.infer<typeof combatantRefSchema>

/**
 * A combatant's engagement: `free`, or `engaged` (melee-locked) with specific
 * combatants. Engagement records *who* a combatant is locked with — never
 * *where* it stands; position is the orthogonal `zoneId` on the combatant.
 */
const engagementSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("free") }),
  z.object({
    status: z.literal("engaged"),
    targetCombatantIds: z.array(z.string()),
  }),
])
export type Engagement = z.infer<typeof engagementSchema>

/**
 * Per-axis Battle Condition durations (turns remaining), sparse: an absent axis
 * means no active duration. This is the one combat-temporal exception that
 * lives on the session rather than the character (PRD Architecture). When a
 * countdown reaches zero the reducer emits the existing `battleConditionAxis →
 * neutral` edit (UNN-293). Charged/Concentrating are single-use flags consumed
 * on the next attack (UNN-294), not durations.
 */
const conditionDurationsSchema = z.partialRecord(
  z.enum(BATTLE_CONDITION_AXIS_KEYS),
  z.number().int().positive()
)
export type ConditionDurations = z.infer<typeof conditionDurationsSchema>

/**
 * One combatant in the encounter. Owns everything about itself: identity
 * ({@link CombatantRef}), turn bookkeeping, position (`zoneId`), engagement,
 * and per-axis durations. The Zone *graph* (zones + adjacency) is UNN-313, so
 * `zoneId` is a free string referencing it until that lands.
 */
export const combatantSchema = z.object({
  id: z.string(),
  side: z.enum(COMBAT_SIDES),
  ref: combatantRefSchema,
  hasActedThisRound: z.boolean(),
  reactionAvailable: z.boolean(),
  zoneId: z.string(),
  engagement: engagementSchema,
  conditionDurations: conditionDurationsSchema,
})
export type Combatant = z.infer<typeof combatantSchema>

/**
 * The full immutable tracker state: the round number, the ordered combatants,
 * and which combatant is currently acting (`null` before anyone is drafted, or
 * between rounds). Turn-loop state (starting advantage, side-drafting, phase)
 * is added by the Turn-Order epic (UNN-285) — this shape is meant to grow
 * per-epic.
 */
export const combatSessionSchema = z.object({
  round: z.number().int().positive(),
  combatants: z.array(combatantSchema),
  currentActorId: z.string().nullable(),
})
export type CombatSession = z.infer<typeof combatSessionSchema>

/**
 * One combatant as supplied to {@link createCombatSession} from encounter
 * setup. The stable combatant id is minted by the constructor; `engagement`
 * defaults to Free.
 */
export interface CombatantSetup {
  side: CombatSide
  ref: CombatantRef
  zoneId: string
  engagement?: Engagement
}

/**
 * Builds a valid initial {@link CombatSession} from encounter-setup inputs:
 * round 1, no current actor (drafting and starting advantage are UNN-303), and
 * every combatant fresh — not yet acted, reaction available, no active
 * durations, and Free unless setup says otherwise. `newId` mints each
 * combatant's stable id (mirrors `reduceCharacter`'s injectable id so tests can
 * be deterministic).
 */
export function createCombatSession(
  setup: CombatantSetup[],
  newId: () => string = () => crypto.randomUUID()
): CombatSession {
  return {
    round: 1,
    currentActorId: null,
    combatants: setup.map((combatant) => ({
      id: newId(),
      side: combatant.side,
      ref: combatant.ref,
      hasActedThisRound: false,
      reactionAvailable: true,
      zoneId: combatant.zoneId,
      engagement: combatant.engagement ?? { status: "free" },
      conditionDurations: {},
    })),
  }
}
