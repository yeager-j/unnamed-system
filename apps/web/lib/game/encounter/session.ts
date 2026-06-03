import { z } from "zod/v4"

import {
  ailmentsSchema,
  BATTLE_CONDITION_AXIS_KEYS,
  battleConditionsSchema,
  DEFAULT_BATTLE_CONDITIONS,
} from "@/lib/game/character"

/**
 * The immutable state the initiative tracker's reducer operates over — the
 * encounter-scoped combat state, plus the combat-temporal and spatial
 * bookkeeping, that the character model deliberately doesn't hold (UNN-291,
 * re-aimed in UNN-331). Per the Architecture ADR (Decision 1), combat state is
 * encounter-scoped and lives on the *combatant*: a combatant carries the overlay
 * (ailments, battle conditions + their durations, position, engagement, turn
 * bookkeeping), uniform for PCs and enemies. A PC is referenced by `characterId`
 * only to source its persistent **vitals** (HP/SP/exhaustion) from the character
 * row; everything the rules clear at end of combat lives on the session. This
 * module is the shape, schema, and constructor only — reducer behavior is
 * UNN-292 and DB serialization is UNN-296.
 */

/**
 * PROVISIONAL inline stat block for a free-entered enemy/NPC combatant. The
 * real shape is finalized in UNN-299 (Free-entry enemy/NPC combatants) — keep
 * call sites thin and expect this to gain fields (e.g. affinities). Captures
 * only the free-enter essentials the PRD §1 lists so a representative session
 * is valid today. `current*` are intentionally unbounded below (overkill can
 * drive HP/SP negative); only `max*` are non-negative.
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
 * How a combatant's **vitals** are sourced: a `pc` defers to its character row
 * for the persistent HP/SP/exhaustion that survives a fight; an `enemy` carries
 * an inline {@link EnemyStatBlock}; a `catalog-enemy` is a stable pointer at a
 * hardcoded {@link import("@/lib/game/enemies").EnemyDefinition} resolved by
 * `enemyKey` at runtime (UNN-336). The pointer holds no mutable vitals — a
 * catalog enemy's working HP is injected onto the combatant when combat is
 * drafted (UNN-303), so the ref stays a stable reference, not a copied blob. The
 * encounter overlay (ailments, battle conditions, durations) lives on the
 * combatant for all kinds — only the vitals source differs (ADR Decision 1).
 *
 * The `enemy` arm is UNN-299's provisional free-entry shape; it is renamed to
 * `custom-enemy` there, pairing with `catalog-enemy` so the two enemy-sourcing
 * arms share a suffix.
 */
const combatantRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pc"), characterId: z.string() }),
  z.object({ kind: z.literal("enemy"), statBlock: enemyStatBlockSchema }),
  z.object({ kind: z.literal("catalog-enemy"), enemyKey: z.string() }),
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
    targetCombatantIds: z.array(z.string()).min(1),
  }),
])
export type Engagement = z.infer<typeof engagementSchema>

/**
 * Per-axis Battle Condition durations (turns remaining), sparse: an absent axis
 * means no active duration. Sits alongside the {@link battleConditions} overlay
 * on the combatant — the durations track *how long*, the overlay tracks *what
 * state*. When a countdown reaches zero the reducer mutates the combatant's
 * `battleConditions[axis]` back to `neutral` directly (ADR Decision 2; UNN-331
 * — no longer an emitted edit). Charged/Concentrating are single-use flags
 * consumed on the next attack (UNN-294), not durations.
 */
const conditionDurationsSchema = z.partialRecord(
  z.enum(BATTLE_CONDITION_AXIS_KEYS),
  z.number().int().positive()
)
export type ConditionDurations = z.infer<typeof conditionDurationsSchema>

/**
 * One combatant in the encounter. Owns everything about itself: identity
 * ({@link CombatantRef}), the encounter overlay (`ailments` + `battleConditions`
 * state and their `conditionDurations`), turn bookkeeping, position (`zoneId`),
 * and engagement. The overlay is identical for PCs and enemies (ADR Decision 1)
 * — it holds the combat state the rules clear at end of combat, which the
 * character row no longer carries. The Zone *graph* (zones + adjacency) is
 * UNN-313, so `zoneId` is a free string referencing it until that lands.
 */
export const combatantSchema = z.object({
  id: z.string(),
  side: z.enum(COMBAT_SIDES),
  ref: combatantRefSchema,
  ailments: ailmentsSchema,
  battleConditions: battleConditionsSchema,
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
 *
 * UNN-292's reducer consumes this as a **decider**: `(session, event) →
 * { session', edits[] }`. Combat-state transitions mutate the combatant overlay
 * in place (ADR Decision 2), so `edits[]` is now reserved for the rare PC
 * **vitals** nudge (e.g. end-of-combat Fallen-restore) the impure shell applies
 * to the character row. The reducer is pure and never performs I/O.
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
 * every combatant fresh — no ailments, all battle conditions neutral, not yet
 * acted, reaction available, no active durations, and Free unless setup says
 * otherwise. `newId` mints each combatant's stable id (mirrors
 * `reduceCharacter`'s injectable id so tests can be deterministic).
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
      ailments: [],
      battleConditions: { ...DEFAULT_BATTLE_CONDITIONS },
      hasActedThisRound: false,
      reactionAvailable: true,
      zoneId: combatant.zoneId,
      engagement: combatant.engagement ?? { status: "free" },
      conditionDurations: {},
    })),
  }
}
