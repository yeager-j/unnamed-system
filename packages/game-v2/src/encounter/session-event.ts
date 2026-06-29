import { z } from "zod/v4"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"
import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
  type CombatAdvantage,
  type CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"

import { participantIdSchema, type ParticipantId } from "./ids"
import {
  AILMENT_KEYS,
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  COUNTER_KEYS,
  type AilmentKey,
  type BattleConditionAxisKey,
  type BattleConditionFlagKey,
  type CounterKey,
} from "./vocab"

/**
 * The session reducer's **event vocabulary** (ADR §2.2; CD4/CD5/CD6, amended
 * CD19) — a type-only leaf the reducer + each slice import without pulling in the
 * orchestrator that imports them back (mirrors v1's `foundation/encounter/
 * session-event.ts`). It declares **two** unions, deliberately split:
 *
 * - {@link CombatEvent} — the **generic DM-console wire**: the eight v1 families
 *   ported 1:1 (same kinds/payloads/no-op contracts) with three honest renames
 *   (`addCombatant→addParticipant`, `removeCombatant→removeParticipant`,
 *   `combatantId→participantId`). Validated on the wire by {@link
 *   combatEventSchema}.
 * - {@link ComponentWriteEvent} — the **router-only** vitals family (the
 *   restructured signed-depletion deltas). It **leaves** the generic wire (CD19):
 *   it is **excluded** from {@link combatEventSchema}, so a durable/vitals target
 *   is *unrepresentable on the generic wire by parse*. Its sole mint point is the
 *   un-exported {@link toSessionEvent}, which the impure write-router (UNN-520)
 *   calls; nothing else can fabricate one.
 *
 * The reducer consumes the union of both — {@link SessionEvent} — over one
 * exhaustive switch; the wire only ever yields a {@link CombatEvent}.
 */

// --- Event action vocabulary -------------------------------------------------

/** The three DM intents on a Battle Condition axis — nudge up, nudge down, or
 *  clear back to neutral. */
export const BATTLE_CONDITION_AXIS_ACTIONS = [
  "increase",
  "decrease",
  "clear",
] as const

export type BattleConditionAxisAction =
  (typeof BATTLE_CONDITION_AXIS_ACTIONS)[number]

/** The three per-turn actions the (non-enforcing) action economy tracks. */
export const ACTION_ECONOMY_ACTIONS = ["move", "standard", "reaction"] as const

export type ActionEconomyAction = (typeof ACTION_ECONOMY_ACTIONS)[number]

/** The two depletion pools a vitals write targets — `hp` → the {@link
 *  import("@workspace/game-v2/vitals/vitals.schema").Vitals} component, `sp` → the
 *  {@link import("@workspace/game-v2/vitals/skill-pool.schema").SkillPool}. */
export const VITALS_POOLS = ["hp", "sp"] as const

export type VitalsPool = (typeof VITALS_POOLS)[number]

// --- The generic wire: CombatEvent (8 families, ported 1:1) -------------------

/**
 * `startCombat` opens the encounter: the DM declares the opening `advantage` and
 * which side acts first. The reducer records both **verbatim** (no normalisation,
 * R2.1) and is a no-op once `advantage` is non-null (R2.2). Resolving `firstSide`
 * and the DB `draft → live` status flip are the shell's job.
 */
export type StartCombatEvent = {
  kind: "startCombat"
  advantage: CombatAdvantage
  firstSide: CombatSide
}

/** `draftCombatant` starts a participant's turn: makes them the `currentActorId`,
 *  resets their action-economy consumption, and clears their Downed ailment
 *  (R4). A no-op for an unknown id; never blocks an ineligible pick. */
export type DraftCombatantEvent = {
  kind: "draftCombatant"
  participantId: ParticipantId
}

/** `endTurn` ends the current actor's turn: increments their
 *  `turnsTakenThisRound` and ticks **only their** condition durations (R5). The
 *  actor stays `currentActorId`; a no-op when there is no/unmatched actor. */
export type EndTurnEvent = { kind: "endTurn" }

/**
 * The materialized setup an {@link AddParticipantEvent} carries (CD4/CD5). It is
 * a {@link import("./session-factory").ParticipantSetup} with its `source`
 * **flattened to a required `entity`** — a `{ catalog }` arm is structurally
 * absent, so the reducer stays **catalog-free by type** (the materialization, if
 * any, happens at the app boundary before dispatch, exactly where the mint does
 * it). A mid-round joiner always enters as already-acted (R6.2), so this setup
 * carries no `hasActed` — the reducer hardcodes it.
 */
export interface AddParticipantSetup {
  id?: ParticipantId
  side: CombatSide
  entity: Entity
}

/**
 * Round-lifecycle + mid-round roster events (R6). `advanceRound` rolls to the
 * next round (increment `round`, null the actor, reset every
 * `turnsTakenThisRound`). `addParticipant` appends a fresh participant entering
 * as already-acted (queued for the next round). `removeParticipant` drops one +
 * nulls the actor if it was current — it does **NOT** sever engagement (R6.3,
 * the Tier-3 occupancy-prune obligation). `setSide` flips a participant's
 * allegiance side.
 */
export type RosterEvent =
  | { kind: "advanceRound" }
  | { kind: "addParticipant"; setup: AddParticipantSetup }
  | { kind: "removeParticipant"; participantId: ParticipantId }
  | { kind: "setSide"; participantId: ParticipantId; side: CombatSide }

/**
 * DM-override events (R7) — unconditional corrections to the turn-loop fields the
 * selectors derive from. `setCurrentActor` writes `currentActorId` even for an
 * unknown id (guides, never rejects). `setActed` maps an acted-boolean onto the
 * `turnsTakenThisRound` count (`hasActed ? 1 : 0`; SUPERSEDE R7.2). `setRound`
 * writes `round` with no clamp.
 */
export type OverrideEvent =
  | { kind: "setCurrentActor"; participantId: ParticipantId }
  | { kind: "setActed"; participantId: ParticipantId; hasActed: boolean }
  | { kind: "setRound"; round: number }

/**
 * Battle-condition overlay events (R8) — the axis *state* plus *how long* it
 * lasts. `adjustBattleConditionAxis` nudges one tri-state axis and drives its
 * clock (same direction **extends**, flip **resets**, `clear`→neutral+drop);
 * `turns` defaults to {@link import("./vocab").DEFAULT_BATTLE_CONDITION_TURNS}.
 * `setBattleConditionFlag` toggles a single-use flag (no duration tick).
 */
export type BattleConditionEvent =
  | {
      kind: "adjustBattleConditionAxis"
      participantId: ParticipantId
      axis: BattleConditionAxisKey
      action: BattleConditionAxisAction
      turns?: number
    }
  | {
      kind: "setBattleConditionFlag"
      participantId: ParticipantId
      flag: BattleConditionFlagKey
      value: boolean
    }

/** Ailment overlay events (R9) — `setAilment` adds a key idempotently;
 *  `clearAilment` removes one. Permissive; a no-op for an unknown id. */
export type AilmentEvent =
  | { kind: "setAilment"; participantId: ParticipantId; ailment: AilmentKey }
  | { kind: "clearAilment"; participantId: ParticipantId; ailment: AilmentKey }

/**
 * Counter overlay events (R10) — `adjustCounter` nudges a named tally by a signed
 * `delta` (floored at 0, key deleted at 0); `clearCounter` removes it outright.
 * Delta-not-absolute so back-to-back nudges merge against the loaded session.
 */
export type CounterEvent =
  | {
      kind: "adjustCounter"
      participantId: ParticipantId
      counter: CounterKey
      delta: number
    }
  | { kind: "clearCounter"; participantId: ParticipantId; counter: CounterKey }

/** `adjustActionEconomy` (R11) nudges one per-turn action's consumption by a
 *  signed `delta` (floored at 0, unbounded above) — so a combatant can consume 2+
 *  of an action type (Tarantella, Follow-Ups). Delta-not-absolute (mirrors
 *  `adjustCounter`); allowance stays the DM/selector's call. Non-enforcing; a
 *  no-op for an unknown id. */
export type ActionEconomyEvent = {
  kind: "adjustActionEconomy"
  participantId: ParticipantId
  action: ActionEconomyAction
  delta: number
}

/**
 * One event on the **generic DM-console wire** — the eight v1 families ported
 * 1:1. The `kind`s stay in lockstep with {@link combatEventSchema} (the runtime
 * guard below) and with the reducer's exhaustive switch. The vitals family is
 * **not** here — it left to {@link ComponentWriteEvent} (CD19).
 */
export type CombatEvent =
  | StartCombatEvent
  | DraftCombatantEvent
  | EndTurnEvent
  | RosterEvent
  | OverrideEvent
  | BattleConditionEvent
  | AilmentEvent
  | CounterEvent
  | ActionEconomyEvent

// --- The router-only family: ComponentWriteEvent (vitals) --------------------

/**
 * The **router-only** vitals family (CD6, amended CD19) — the restructured
 * signed-depletion deltas that replace v1's absolute `adjustEnemyVitals`. Each
 * targets a pool (`hp`/`sp`); `damageParticipant`/`healParticipant` apply through
 * the depletion operations and `setParticipantMax` writes the component's `base`.
 *
 * It is **excluded** from {@link combatEventSchema} (the generic wire), so it is
 * unrepresentable on that wire. Its sole constructor is {@link toSessionEvent}
 * (un-exported outside this module); the impure write-router (UNN-520) calls it
 * to dispatch an **ephemeral** vitals write through the reducer, and the router's
 * authoritative storage-home check guarantees a durable target never reaches it.
 */
export type ComponentWriteEvent = {
  kind: "damageParticipant" | "healParticipant" | "setParticipantMax"
  participantId: ParticipantId
  pool: VitalsPool
  amount: number
}

/**
 * The reducer's input — the union of the generic wire and the router-only family.
 * {@link createReduceSession} switches over this exhaustively; the wire validator
 * only ever produces the {@link CombatEvent} half.
 */
export type SessionEvent = CombatEvent | ComponentWriteEvent

// --- The wire validator: combatEventSchema (NO ComponentWrite arm) ------------

/**
 * Validates an addParticipant's entity by **reusing the {@link loadEntity} load
 * seam** (F6) rather than reinventing an entity schema: the envelope shape
 * (`{ id, components }`) is checked here, then `loadEntity` validates the opaque
 * `components` blob and materializes the typed {@link Entity}. An invalid blob
 * fails the parse (so the transform's output type stays `Entity`, never a partial
 * shape). The inline-entity wire shape is 517's baseline; a thin durable-ref
 * variant (the shell hydrates an `{ entityId }` ref into the same materialized
 * entity before building the reducer event) is the cutover's call (UNN-520) and
 * produces the identical reducer event, so the reducer never changes.
 */
const wireEntitySchema = z
  .object({ id: z.string(), components: z.unknown() })
  .transform((raw, ctx): Entity => {
    const loaded = loadEntity(raw.id, raw.components)
    if (!loaded.ok) {
      ctx.addIssue({ code: "custom", message: "invalid entity components" })
      return z.NEVER
    }
    return loaded.value
  })

const addParticipantSetupSchema = z.object({
  id: participantIdSchema.optional(),
  side: z.enum(COMBAT_SIDES),
  entity: wireEntitySchema,
})

/**
 * Runtime validator for a {@link CombatEvent} arriving over the **generic wire** —
 * the boundary the impure shell parses an untrusted client payload through before
 * the reducer. It mirrors the hand-written {@link CombatEvent} union
 * member-for-member; the {@link _combatEventSchemaInSync} lockstep below stops the
 * two from drifting.
 *
 * It carries **no `ComponentWrite` arm** (CD19): a vitals/durable target is
 * structurally **unrepresentable** here, which is the mechanism behind
 * "ephemeral-only by construction" — the impure {@link ApplyCombatEventSchema
 * envelope} (apps/web, UNN-520) composes over this schema and inherits the
 * exclusion.
 */
export const combatEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("startCombat"),
    advantage: z.enum(COMBAT_ADVANTAGES),
    firstSide: z.enum(COMBAT_SIDES),
  }),
  z.object({
    kind: z.literal("draftCombatant"),
    participantId: participantIdSchema,
  }),
  z.object({ kind: z.literal("endTurn") }),
  z.object({ kind: z.literal("advanceRound") }),
  z.object({
    kind: z.literal("addParticipant"),
    setup: addParticipantSetupSchema,
  }),
  z.object({
    kind: z.literal("removeParticipant"),
    participantId: participantIdSchema,
  }),
  z.object({
    kind: z.literal("setSide"),
    participantId: participantIdSchema,
    side: z.enum(COMBAT_SIDES),
  }),
  z.object({
    kind: z.literal("setCurrentActor"),
    participantId: participantIdSchema,
  }),
  z.object({
    kind: z.literal("setActed"),
    participantId: participantIdSchema,
    hasActed: z.boolean(),
  }),
  z.object({ kind: z.literal("setRound"), round: z.number().int().positive() }),
  z.object({
    kind: z.literal("adjustBattleConditionAxis"),
    participantId: participantIdSchema,
    axis: z.enum(BATTLE_CONDITION_AXIS_KEYS),
    action: z.enum(BATTLE_CONDITION_AXIS_ACTIONS),
    turns: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("setBattleConditionFlag"),
    participantId: participantIdSchema,
    flag: z.enum(BATTLE_CONDITION_FLAG_KEYS),
    value: z.boolean(),
  }),
  z.object({
    kind: z.literal("setAilment"),
    participantId: participantIdSchema,
    ailment: z.enum(AILMENT_KEYS),
  }),
  z.object({
    kind: z.literal("clearAilment"),
    participantId: participantIdSchema,
    ailment: z.enum(AILMENT_KEYS),
  }),
  z.object({
    kind: z.literal("adjustCounter"),
    participantId: participantIdSchema,
    counter: z.enum(COUNTER_KEYS),
    delta: z.number().int(),
  }),
  z.object({
    kind: z.literal("clearCounter"),
    participantId: participantIdSchema,
    counter: z.enum(COUNTER_KEYS),
  }),
  z.object({
    kind: z.literal("adjustActionEconomy"),
    participantId: participantIdSchema,
    action: z.enum(ACTION_ECONOMY_ACTIONS),
    delta: z.number().int(),
  }),
])

/**
 * Resolves to `true` only when `A` and `B` are mutually assignable (an invariant
 * equality), `false` otherwise — the standard two-function trick. Local to this
 * module (game-v2 has no shared equality util yet) and used only by the lockstep
 * assertion below.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

/**
 * Compile-time lockstep guard: if {@link combatEventSchema} and the hand-written
 * {@link CombatEvent} union ever diverge (a kind added to one but not the other, a
 * renamed payload field), this assignment stops compiling.
 */
const _combatEventSchemaInSync: Equals<
  z.infer<typeof combatEventSchema>,
  CombatEvent
> = true
void _combatEventSchemaInSync

// --- The router's sole ComponentWriteEvent constructor (un-exported) ----------

/** Which depletion component a router write names (the router's own vocabulary). */
type VitalsComponent = "vitals" | "skillPool"

/** The router's write verb, mapped to a {@link ComponentWriteEvent} kind. */
type VitalsOp = "damage" | "heal" | "setMax"

const OP_TO_KIND = {
  damage: "damageParticipant",
  heal: "healParticipant",
  setMax: "setParticipantMax",
} as const satisfies Record<VitalsOp, ComponentWriteEvent["kind"]>

const COMPONENT_TO_POOL = {
  vitals: "hp",
  skillPool: "sp",
} as const satisfies Record<VitalsComponent, VitalsPool>

/**
 * The **sole** constructor of a {@link ComponentWriteEvent} (CD19). Translates the
 * write-router's domain vocabulary (`component` + `op`) into the wire-internal
 * vitals event the reducer consumes. **Deliberately not re-exported from
 * `encounter/index.ts`** (it is omitted from the barrel): the impure write-router
 * module (UNN-520) imports it via its deep path, and no other code can mint a
 * vitals event — closing the arm-selection risk together with the {@link
 * combatEventSchema} exclusion and the router's authoritative storage-home check.
 */
export function toSessionEvent(intent: {
  participantId: ParticipantId
  component: VitalsComponent
  op: VitalsOp
  amount: number
}): ComponentWriteEvent {
  return {
    kind: OP_TO_KIND[intent.op],
    participantId: intent.participantId,
    pool: COMPONENT_TO_POOL[intent.component],
    amount: intent.amount,
  }
}
