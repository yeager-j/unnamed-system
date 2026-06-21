import { z } from "zod/v4"

import {
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  type BattleConditionAxisKey,
  type BattleConditionFlagKey,
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
import type { Equals } from "@workspace/game/foundation/equals"

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
 * `addCombatant` joins a combatant: it enters with `hasActedThisRound = true` so
 * a mid-fight joiner is queued for the next round (`startCombat` resets the flag
 * for an at-setup roster). Its stable id is the `setup.id` when supplied (the
 * encounter-setup surface mints it client-side so the optimistic id matches the
 * persisted one — UNN-347) and the reducer's injectable `newId` otherwise (the
 * mid-combat join). `removeCombatant` drops a combatant; if it was the current
 * actor, `currentActorId` is cleared, and the removed id is pruned from every
 * partner's engagement (symmetric melee-lock — UNN-347). `setSide` flips a
 * combatant's {@link CombatSide} (the setup side control, also a mid-fight charm/
 * summon correction). Auto-advancing when everyone has acted is a UI decision,
 * out of scope here (UNN-306).
 */
export type RoundEvent =
  | { kind: "advanceRound" }
  | { kind: "addCombatant"; setup: CombatantSetup }
  | { kind: "removeCombatant"; combatantId: string }
  | { kind: "setSide"; combatantId: string; side: CombatSide }

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
    kind: z.literal("setSide"),
    combatantId: z.string(),
    side: z.enum(COMBAT_SIDES),
  }),
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
    flag: z.enum(BATTLE_CONDITION_FLAG_KEYS),
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
])

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

/**
 * The subset of {@link CombatEvent} a **player** may issue against their own
 * combatant from the watch view — the session-overlay condition edits the DM's
 * combatant-conditions drawer also issues (ailments + the battle-condition
 * axes/flags). Vitals, turn-loop, zones, engagement, and enemy edits stay
 * DM-only; PC vitals never travel as events (character row, pools actions). The
 * player Server Action and the client hook both gate on this one list so they
 * cannot drift.
 */
export const PLAYER_OVERLAY_EVENT_KINDS = [
  "setAilment",
  "clearAilment",
  "adjustBattleConditionAxis",
  "setBattleConditionFlag",
] as const satisfies readonly CombatEvent["kind"][]

/**
 * A {@link CombatEvent} narrowed to the player-issuable overlay edits. Every
 * member carries a `combatantId`, which the Server Action checks the caller owns.
 */
export type PlayerOverlayEvent = Extract<
  CombatEvent,
  { kind: (typeof PLAYER_OVERLAY_EVENT_KINDS)[number] }
>

/** Narrows an arbitrary {@link CombatEvent} to a {@link PlayerOverlayEvent} — the
 *  player-write guard both the action and the client hook share. */
export function isPlayerOverlayEvent(
  event: CombatEvent
): event is PlayerOverlayEvent {
  return (PLAYER_OVERLAY_EVENT_KINDS as readonly string[]).includes(event.kind)
}
