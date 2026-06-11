import { z } from "zod/v4"

import {
  ailmentsSchema,
  BATTLE_CONDITION_AXIS_KEYS,
  battleConditionsSchema,
} from "@workspace/game/foundation/character/state"
import { countersSchema } from "@workspace/game/foundation/combat/counters"
import { zoneEnchantmentSchema } from "@workspace/game/foundation/combat/enchantment"

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
 * is valid today. The `adjustEnemyVitals` reducer floors every value at 0
 * (overkill can't drive HP negative — matching the PC engine), so `current*`
 * never go below 0 in practice; the schema stays a plain `int` (the runtime
 * floor is the enforcement point) rather than re-validating persisted sessions.
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
 * One Zone — a ~30 ft region of the battlefield (UNN-313). Carries a stable `id`
 * (also its key in {@link CombatSession.zones}, so a Zone is self-describing), a
 * DM-supplied display `name`, and optional free-text `notes`. The Zone *graph*
 * (which zones are adjacent) lives in {@link CombatSession.adjacency}, not here —
 * a Zone holds only its own identity. Combatant position is the orthogonal
 * `combatant.zoneId` referencing this map's key (UNN-315 narrows that field).
 */
export const zoneSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  notes: z.string().optional(),
})
export type Zone = z.infer<typeof zoneSchema>

/**
 * The two sides a combatant can belong to. A PC is not pinned to `players` — a
 * charmed PC or a summoned NPC ally can sit on either side — so `side` is
 * orthogonal to whether a combatant is a PC or a free-entered enemy.
 */
export const COMBAT_SIDES = ["players", "enemies"] as const
export type CombatSide = (typeof COMBAT_SIDES)[number]

/**
 * The opening state a DM declares for an encounter (UNN-303). `players`/`enemies`
 * advantage = that side takes all its opening turns before the other acts;
 * `neutral` = standard alternating order from round one. Distinct from
 * {@link CombatSide} because it carries the extra `neutral` arm — advantage is
 * "who, if anyone, gets the jump", not a side a combatant belongs to.
 */
export const COMBAT_ADVANTAGES = ["players", "enemies", "neutral"] as const
export type CombatAdvantage = (typeof COMBAT_ADVANTAGES)[number]

/**
 * How a combatant's **vitals** are sourced: a `pc` defers to its character row
 * for the persistent HP/SP/exhaustion that survives a fight; an `enemy` carries
 * an inline {@link EnemyStatBlock}; a `catalog-enemy` points at a hardcoded
 * {@link import("@/lib/game/enemies").EnemyDefinition} resolved by `enemyKey` at
 * runtime (UNN-336) for its immutable identity (attributes, affinities, skills,
 * name, level), and carries only its **working HP** inline (UNN-309):
 * `currentHP`/`maxHP` are the per-encounter values the DM adjusts, both
 * `undefined` until first touched and defaulting to the definition's `maxHP`
 * (so a catalog enemy enters at full with nothing to seed). This keeps the ref a
 * thin reference + two working numbers, not a copied stat blob. Catalog enemies
 * have **no SP** (the definition declares none). The encounter overlay
 * (ailments, battle conditions, durations) lives on the combatant for all kinds
 * — only the vitals source differs (ADR Decision 1).
 *
 * The `enemy` arm is UNN-299's provisional free-entry shape; it is renamed to
 * `custom-enemy` there, pairing with `catalog-enemy` so the two enemy-sourcing
 * arms share a suffix.
 */
const combatantRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pc"), characterId: z.string() }),
  z.object({ kind: z.literal("enemy"), statBlock: enemyStatBlockSchema }),
  z.object({
    kind: z.literal("catalog-enemy"),
    enemyKey: z.string(),
    currentHP: z.number().int().optional(),
    maxHP: z.number().int().nonnegative().optional(),
  }),
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
 * state and their `conditionDurations`, plus named `counters` like Lumina), turn
 * bookkeeping, position (`zoneId`),
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
  moveAvailable: z.boolean().default(true),
  standardAvailable: z.boolean().default(true),
  reactionAvailable: z.boolean(),
  zoneId: z.string(),
  engagement: engagementSchema,
  conditionDurations: conditionDurationsSchema,
  counters: countersSchema.default({}),
})
export type Combatant = z.infer<typeof combatantSchema>

/**
 * The full immutable tracker state: the round number, the ordered combatants,
 * which combatant is currently acting (`null` before anyone is drafted, or
 * between rounds), and the opening-advantage declaration (`advantage` +
 * `firstSide`, both `null` while the encounter is in `draft` status — set by the
 * `startCombat` event, UNN-303). `firstSide` records who acts first even when
 * `advantage` is `neutral`; both are consumed by the `nextDraftingSide` selector
 * (UNN-304) so it stays a pure function of session state. Turn-loop state
 * (side-drafting, phase) is added by the Turn-Order epic (UNN-285) — this shape
 * is meant to grow per-epic.
 *
 * UNN-292's reducer consumes this as a **decider**: `(session, event) →
 * { session', edits[] }`. Combat-state transitions mutate the combatant overlay
 * in place (ADR Decision 2), so `edits[]` is now reserved for the rare PC
 * **vitals** nudge (e.g. end-of-combat Fallen-restore) the impure shell applies
 * to the character row. The reducer is pure and never performs I/O.
 *
 * `zones` + `adjacency` are the spatial graph (UNN-313): `zones` maps a zone id
 * to its {@link Zone}, and `adjacency` maps a zone id to the ids it borders
 * (undirected — both directions are stored). Both default to `{}` so sessions
 * persisted before zones existed still parse (`load-encounter.ts` re-parses the
 * jsonb). Referential integrity (`combatant.zoneId` ∈ `zones`) is a runtime
 * convention, not enforced by the schema.
 *
 * `enchantment` is the Bard mechanic's single active Zone Enchantment (see
 * {@link import("../combat/enchantment").zoneEnchantmentSchema} for why it is a
 * session-level singleton, not a Zone field). Defaults to `null` so sessions
 * persisted before Enchantments existed still parse, matching `zones`.
 */
export const combatSessionSchema = z.object({
  round: z.number().int().positive(),
  combatants: z.array(combatantSchema),
  currentActorId: z.string().nullable(),
  advantage: z.enum(COMBAT_ADVANTAGES).nullable(),
  firstSide: z.enum(COMBAT_SIDES).nullable(),
  zones: z.record(z.string(), zoneSchema).default({}),
  adjacency: z.record(z.string(), z.array(z.string())).default({}),
  enchantment: zoneEnchantmentSchema.nullable().default(null),
})
export type CombatSession = z.infer<typeof combatSessionSchema>

/**
 * One combatant as supplied to {@link createCombatSession} from encounter
 * setup. `engagement` defaults to Free. Schema-first (like {@link combatantSchema})
 * so it doubles as the wire-payload validator for the `addCombatant` event at the
 * shell boundary (UNN-332).
 *
 * `id` is **optional**: the setup UI (UNN-301) mints a stable id when a combatant
 * is added so it survives every "Save draft" round-trip — that stability is what
 * lets `engagement.targetCombatantIds` and zone placement reference a combatant
 * across saves. {@link createCombatSession} honors a supplied `id` and falls back
 * to its `newId` for callers that omit it (fixtures, the mid-combat `addCombatant`
 * join, which mints server-side regardless).
 */
export const combatantSetupSchema = z.object({
  id: z.string().optional(),
  side: z.enum(COMBAT_SIDES),
  ref: combatantRefSchema,
  zoneId: z.string(),
  engagement: engagementSchema.optional(),
})
export type CombatantSetup = z.infer<typeof combatantSetupSchema>
