import { z } from "zod/v4"

import { type BattleConditionFlagKey } from "@workspace/game/foundation/character/character-edit"
import {
  BATTLE_CONDITION_AXIS_KEYS,
  type BattleConditionAxisKey,
} from "@workspace/game/foundation/character/state"
import {
  AILMENT_KEYS,
  type AilmentKey,
} from "@workspace/game/foundation/combat/ailments"
import {
  COUNTER_KEYS,
  type CounterKey,
} from "@workspace/game/foundation/combat/counters"
import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
  combatantSetupSchema,
  type CombatAdvantage,
  type CombatantSetup,
  type CombatSide,
} from "@workspace/game/foundation/encounter/session"

/**
 * The tracker reducer's vocabulary: the events that drive a {@link CombatSession}
 * forward, and the result a transition produces. A type-only leaf module
 * (mirrors the character engine's `character-edit.ts`) so a slice imports the
 * event it handles without importing the orchestrator that imports the slice
 * back.
 *
 * `CombatEvent` is the sum of per-domain sub-unions, exactly like `CharacterEdit`.
 * Sibling tickets add their own sub-unions (zones UNN-287, Charged/Concentrating
 * UNN-294, turn-order UNN-285, panel UNN-286) and a matching `switch` case — the
 * union and its dispatch grow together.
 */

/** `endTurn` ends the current actor's turn (they are marked as having acted; the
 *  actor is kept as `currentActorId`). */
export type EndTurnEvent = { kind: "endTurn" }

/**
 * `startCombat` opens the encounter: the DM declares the opening `advantage` and
 * which side acts first (`firstSide`). The reducer just records both on the
 * session **verbatim** — it is a no-op once `advantage` is non-null (an encounter
 * cannot start twice). The shell resolves `firstSide` (highest-Agility side,
 * DM-overridable) and transitions the DB `status` `draft → live` *after*
 * persisting the reduced session (UNN-332); the pure reducer never touches status.
 *
 * `firstSide` is only *meaningfully free* under `neutral` advantage; for
 * `players`/`enemies` advantage the advantaged side takes the opening turns, so
 * the shell resolves `firstSide` to that same side. That coupling is the shell's
 * invariant to uphold, not the reducer's — the reducer records whatever pair it
 * is given so it stays a pure, total recorder. `advantage`/`firstSide` are
 * consumed by the `nextDraftingSide` selector (UNN-304).
 */
export type StartCombatEvent = {
  kind: "startCombat"
  advantage: CombatAdvantage
  firstSide: CombatSide
}

/**
 * `draftCombatant` starts a combatant's turn: it makes them the `currentActorId`,
 * clears their Downed ailment (the one *start*-of-turn effect — rulebook 3.7),
 * and refreshes their reaction. It never blocks: the UI highlights the eligible
 * side ({@link import("./selectors").nextDraftingSide}), but the DM may draft any
 * combatant (ADR Decision 8; UNN-304). Whose turn it *should* be is derived, not
 * stored — no `draftingSide` field exists.
 */
export type DraftCombatantEvent = {
  kind: "draftCombatant"
  combatantId: string
}

/** Turn-loop events. The rest of the turn model (round rollover, Fallen-skip,
 *  per-turn effects) is the Turn-Order epic (UNN-285) extending this sub-union. */
export type TurnEvent = EndTurnEvent | StartCombatEvent | DraftCombatantEvent

/**
 * Round-lifecycle + mid-round roster events. `advanceRound` rolls the encounter
 * to the next round: it increments `round`, resets every combatant's
 * `hasActedThisRound` to `false`, and clears `currentActorId` — the only event
 * that clears those flags (individual flags are set by `endTurn`). It always
 * applies, even when no one has acted, as an idempotent round-end safeguard.
 * `addCombatant` joins a combatant mid-fight: it enters with
 * `hasActedThisRound = true` so it is not eligible until the next round (its
 * stable id is minted by the reducer's injectable `newId`). `removeCombatant`
 * drops a combatant; if it was the current actor, `currentActorId` is cleared.
 * Auto-advancing when everyone has acted is a UI decision, out of scope here
 * (UNN-306).
 */
export type RoundEvent =
  | { kind: "advanceRound" }
  | { kind: "addCombatant"; setup: CombatantSetup }
  | { kind: "removeCombatant"; combatantId: string }

/** The three DM intents on a Battle Condition axis — nudge it up, nudge it down,
 *  or clear it back to neutral. */
export const BATTLE_CONDITION_AXIS_ACTIONS = [
  "increase",
  "decrease",
  "clear",
] as const
export type BattleConditionAxisAction =
  (typeof BATTLE_CONDITION_AXIS_ACTIONS)[number]

/**
 * Battle-condition overlay events — the *state* a combatant carries plus *how
 * long* it lasts (ADR Decision 1), all on the combatant overlay:
 *
 * - `adjustBattleConditionAxis` nudges one tri-state axis (Attack / Defense /
 *   Hit-Evasion) and drives its duration clock in a single intent (UNN-310):
 *   `increase`/`decrease` set the axis to `increased`/`decreased` and start a
 *   `turns`-long clock; re-applying the same direction **extends** rather than
 *   stacks (rulebook 3.8 — Tarukaja twice → 6 turns); `clear` resets the axis to
 *   `neutral` and drops the clock. `turns` is optional — the reducer falls back to
 *   {@link DEFAULT_BATTLE_CONDITION_TURNS} (the DM drawer supplies it; custom
 *   durations ride the event). Decrement and expiry happen on `endTurn`, which
 *   resets the axis state back to `neutral` at 0.
 * - `setBattleConditionFlag` toggles a single-use flag (Charged / Concentrating)
 *   on **or** off — manual, no auto-consume, no duration tick (UNN-294 policy).
 *
 * The DM sets axis/flag state from the combatant drawer (UNN-310); the same
 * overlay lives on the character sheet too until UNN-333 retires that copy.
 */
export type BattleConditionEvent =
  | {
      kind: "adjustBattleConditionAxis"
      combatantId: string
      axis: BattleConditionAxisKey
      action: BattleConditionAxisAction
      turns?: number
    }
  | {
      kind: "setBattleConditionFlag"
      combatantId: string
      flag: BattleConditionFlagKey
      value: boolean
    }

/**
 * Ailment overlay events (UNN-310). `setAilment` adds an ailment key to the
 * combatant; `clearAilment` removes one. Both are **permissive** — the app
 * tracks whatever the DM records and never enforces the "one non-Downed at a
 * time" convention (that is the DM's call at the table, mirroring the permissive
 * `ailmentsSchema`). Downed set here surfaces the rail badge + draft-skip; it
 * clears at the start of the combatant's next turn via `draftCombatant`.
 */
export type AilmentEvent =
  | { kind: "setAilment"; combatantId: string; ailment: AilmentKey }
  | { kind: "clearAilment"; combatantId: string; ailment: AilmentKey }

/**
 * Counter overlay events — adjust a named tally (Lumina, …) on a combatant. Like
 * the ailment events, **permissive**: the app tracks whatever the DM records and
 * never enforces a cap (Lumina's per-caster Luck max is the DM's call).
 *
 * - `adjustCounter` nudges the counter by a signed `delta`. **Delta, not an
 *   absolute** so the reducer merges against the loaded session: back-to-back +1
 *   clicks can't each read a stale count and overwrite one another. The count is
 *   floored at 0 and its key dropped when it reaches 0.
 * - `clearCounter` removes the counter outright (the "remove" affordance) — its
 *   own primitive because a client can't compute `delta = -current` without a
 *   stale read.
 */
export type CounterEvent =
  | {
      kind: "adjustCounter"
      combatantId: string
      counter: CounterKey
      delta: number
    }
  | { kind: "clearCounter"; combatantId: string; counter: CounterKey }

/**
 * The three per-turn actions the (non-enforcing) action economy tracks. `move`
 * and `standard` join the long-standing `reaction` (UNN-310); all three reset to
 * available at the start of a normal turn via `draftCombatant`.
 */
export const ACTION_ECONOMY_ACTIONS = ["move", "standard", "reaction"] as const
export type ActionEconomyAction = (typeof ACTION_ECONOMY_ACTIONS)[number]

/**
 * `setActionEconomy` flips one of a combatant's per-turn action toggles
 * (Move / Standard / Reaction) on or off (UNN-310). **Non-enforcing** — it never
 * blocks acting (ADR Decision 8); it is a tracking aid the DM eyeballs.
 */
export type ActionEconomyEvent = {
  kind: "setActionEconomy"
  combatantId: string
  action: ActionEconomyAction
  available: boolean
}

/**
 * DM override events — manual corrections to the turn-loop fields the guiding
 * selectors derive from. Each is applied **unconditionally**: the engine guides
 * but never rejects (ADR Decision 8), so an out-of-order actor, a re-flagged
 * combatant, or a manual round rollback simply shifts where the selectors point
 * next. Clearing the current actor is *not* one of these — that is `advanceRound`
 * (UNN-307). The reducer holds no permission checks; auth is `requireCampaignDM`
 * at the Server Action boundary.
 */
export type OverrideEvent =
  | { kind: "setCurrentActor"; combatantId: string }
  | { kind: "setActed"; combatantId: string; hasActed: boolean }
  | { kind: "setRound"; round: number }

/**
 * The four vitals fields on an enemy combatant's inline stat block. PC vitals
 * never travel as an event — they live on the character row and are written
 * through the (DM-authorized) pools actions, not the session reducer.
 */
export const ENEMY_VITALS_FIELDS = [
  "currentHP",
  "currentSP",
  "maxHP",
  "maxSP",
] as const
export type EnemyVitalsField = (typeof ENEMY_VITALS_FIELDS)[number]

/**
 * `adjustEnemyVitals` sets one field of an enemy combatant's working vitals to
 * an absolute `value` (UNN-309): an inline `enemy` writes its `statBlock`; a
 * `catalog-enemy` writes `currentHP`/`maxHP` inline on its ref (its identity
 * stays resolved from the definition by `enemyKey`, and it has no SP). A no-op
 * for a PC (vitals live on the character row, written via the pools actions).
 * Every field is **floored at 0** by the reducer — overkill can't drive HP
 * negative, matching how the character engine floors PC damage.
 */
export type EnemyVitalsEvent = {
  kind: "adjustEnemyVitals"
  combatantId: string
  field: EnemyVitalsField
  value: number
}

/**
 * Zone-graph events (UNN-313) — mutate the spatial graph on the session
 * (`zones` + `adjacency`), never a combatant:
 *
 * - `addZone` mints a new {@link import("./session").Zone} via the reducer's
 *   injectable `newId` (same pattern as `addCombatant`) — the client supplies
 *   only the display `name` and optional `notes`, not the id.
 * - `removeZone` drops a zone and prunes it from every adjacency list. It does
 *   **not** touch any `combatant.zoneId` — zone-id cleanup is the caller's job
 *   (placement is UNN-315).
 * - `setZoneAdjacency` records (or clears) an **undirected** edge between two
 *   zones; idempotent — re-adding an existing edge does not duplicate it.
 * - `renameZone` updates a zone's display name.
 *
 * Each is a no-op when a referenced zone id is unknown. The graph is pure engine
 * shape here (UNN-313); rendering is UNN-314 and movement/placement is UNN-315.
 */
export type ZoneGraphEvent =
  | { kind: "addZone"; name: string; notes?: string }
  | { kind: "removeZone"; zoneId: string }
  | {
      kind: "setZoneAdjacency"
      zoneIdA: string
      zoneIdB: string
      adjacent: boolean
    }
  | { kind: "renameZone"; zoneId: string; name: string }

/**
 * `moveCombatant` travels a combatant to `toZoneId` (UNN-315) — the in-play
 * placement edit, also reused to place an unplaced (empty-`zoneId`) mid-combat
 * joiner. The reducer sets `combatant.zoneId` verbatim and never validates that
 * `toZoneId` exists in `session.zones` (no referential enforcement — UNN-313
 * decision; the DM control offers only adjacent zones). Per ADR Decision 8 it
 * **guides, doesn't block**: a non-adjacent target is still applied. Moving to
 * the occupied zone, or an unknown combatant id, is a no-op.
 */
export type MoveCombatantEvent = {
  kind: "moveCombatant"
  combatantId: string
  toZoneId: string
}

/**
 * Engagement events (UNN-316) — the *who* a combatant is melee-locked with, on
 * the combatant overlay (position is the orthogonal `zoneId`, UNN-315):
 *
 * - `setEngagement` replaces the combatant's engagement with
 *   `{ status: "engaged", targetCombatantIds }` (≥1 target).
 * - `clearEngagement` sets it back to `{ status: "free" }`.
 *
 * Engagement is **symmetric**: the reducer mirrors every change onto the targets
 * (A engaged with B ⟺ B engaged with A). Target ids are **not** validated at
 * reduce-time (same philosophy as `zoneId`/`toZoneId` — UNN-313/315); the DM
 * control offers only same-zone combatants. An unknown combatant id, or clearing
 * an already-Free combatant, is a no-op. This is the live-combat counterpart of
 * UNN-301's setup-time `setEngagementTargets`.
 */
export type EngagementEvent =
  | {
      kind: "setEngagement"
      combatantId: string
      targetCombatantIds: string[]
    }
  | { kind: "clearEngagement"; combatantId: string }

/**
 * One event applied to a {@link CombatSession}. The discriminated union the
 * reducer dispatches over; its `kind`s stay in lockstep with the orchestrator's
 * exhaustive `switch`.
 */
export type CombatEvent =
  | TurnEvent
  | RoundEvent
  | BattleConditionEvent
  | AilmentEvent
  | CounterEvent
  | ActionEconomyEvent
  | EnemyVitalsEvent
  | OverrideEvent
  | ZoneGraphEvent
  | MoveCombatantEvent
  | EngagementEvent

/**
 * Runtime validator for a {@link CombatEvent} arriving over the wire — the
 * boundary the impure shell (`applyCombatEvent`, UNN-332) parses an untrusted
 * client payload through before handing it to the pure reducer. Mirrors the
 * hand-written {@link CombatEvent} union member-for-member; the lockstep
 * assertion below stops the two from drifting.
 */
export const combatEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("endTurn") }),
  z.object({
    kind: z.literal("startCombat"),
    advantage: z.enum(COMBAT_ADVANTAGES),
    firstSide: z.enum(COMBAT_SIDES),
  }),
  z.object({ kind: z.literal("draftCombatant"), combatantId: z.string() }),
  z.object({ kind: z.literal("advanceRound") }),
  z.object({ kind: z.literal("addCombatant"), setup: combatantSetupSchema }),
  z.object({ kind: z.literal("removeCombatant"), combatantId: z.string() }),
  z.object({
    kind: z.literal("adjustBattleConditionAxis"),
    combatantId: z.string(),
    axis: z.enum(BATTLE_CONDITION_AXIS_KEYS),
    action: z.enum(BATTLE_CONDITION_AXIS_ACTIONS),
    turns: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("setBattleConditionFlag"),
    combatantId: z.string(),
    flag: z.enum(["charged", "concentrating"]),
    value: z.boolean(),
  }),
  z.object({
    kind: z.literal("setAilment"),
    combatantId: z.string(),
    ailment: z.enum(AILMENT_KEYS),
  }),
  z.object({
    kind: z.literal("clearAilment"),
    combatantId: z.string(),
    ailment: z.enum(AILMENT_KEYS),
  }),
  z.object({
    kind: z.literal("adjustCounter"),
    combatantId: z.string(),
    counter: z.enum(COUNTER_KEYS),
    delta: z.number().int(),
  }),
  z.object({
    kind: z.literal("clearCounter"),
    combatantId: z.string(),
    counter: z.enum(COUNTER_KEYS),
  }),
  z.object({
    kind: z.literal("setActionEconomy"),
    combatantId: z.string(),
    action: z.enum(ACTION_ECONOMY_ACTIONS),
    available: z.boolean(),
  }),
  z.object({ kind: z.literal("setCurrentActor"), combatantId: z.string() }),
  z.object({
    kind: z.literal("setActed"),
    combatantId: z.string(),
    hasActed: z.boolean(),
  }),
  z.object({
    kind: z.literal("adjustEnemyVitals"),
    combatantId: z.string(),
    field: z.enum(ENEMY_VITALS_FIELDS),
    value: z.number().int(),
  }),
  z.object({ kind: z.literal("setRound"), round: z.number().int().positive() }),
  z.object({
    kind: z.literal("addZone"),
    name: z.string().min(1),
    notes: z.string().optional(),
  }),
  z.object({ kind: z.literal("removeZone"), zoneId: z.string() }),
  z.object({
    kind: z.literal("setZoneAdjacency"),
    zoneIdA: z.string(),
    zoneIdB: z.string(),
    adjacent: z.boolean(),
  }),
  z.object({
    kind: z.literal("renameZone"),
    zoneId: z.string(),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("moveCombatant"),
    combatantId: z.string(),
    toZoneId: z.string(),
  }),
  z.object({
    kind: z.literal("setEngagement"),
    combatantId: z.string(),
    targetCombatantIds: z.array(z.string()).min(1),
  }),
  z.object({ kind: z.literal("clearEngagement"), combatantId: z.string() }),
])

/** `true` only when `A` and `B` are mutually assignable (structurally equal). */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/**
 * Compile-time lockstep guard: if {@link combatEventSchema} and the hand-written
 * {@link CombatEvent} union ever diverge (a new event kind added to one but not
 * the other, a payload field renamed), this assignment stops compiling.
 */
const _combatEventSchemaInSync: Equals<
  z.infer<typeof combatEventSchema>,
  CombatEvent
> = true
void _combatEventSchemaInSync
