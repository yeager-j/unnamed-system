import { z } from "zod/v4"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
} from "@workspace/game-v2/kernel/vocab/combat"

import {
  AILMENT_KEYS,
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  COUNTER_KEYS,
} from "./vocab"

/**
 * The session reducer's **event vocabulary** (ADR §2.2; CD4/CD5/CD6, amended
 * CD19) — a type-only leaf the reducer + each slice import without pulling in the
 * orchestrator that imports them back (mirrors v1's `foundation/encounter/
 * session-event.ts`). {@link CombatEvent} is the schema-backed engine
 * vocabulary: the eight v1 families
 *   ported 1:1 (same kinds/payloads/no-op contracts) with three honest renames
 *   (`addCombatant→addParticipant`, `removeCombatant→removeParticipant`,
 *   `combatantId→participantId`). It is **inferred from {@link combatEventSchema}**
 *   (the schema is the single source); the per-family aliases below are `Extract`
 *   views over it, so no event shape is authored twice. UNN-656 deleted the
 *   former router-only component event family; component writes use Writers
 *   directly through their Replica mutations.
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

// --- The generic wire: combatEventSchema (the single source) ------------------

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
 * the reducer. It is the **single source** of the generic event shapes:
 * {@link CombatEvent} is its inferred type, and each family alias below is an
 * `Extract` view, so the schema and the types cannot drift.
 *
 * It carries **no `ComponentWrite` arm** (CD19): a vitals/durable target is
 * structurally **unrepresentable** here, which is the mechanism behind
 * "ephemeral-only by construction" — the impure {@link ApplyCombatEventSchema
 * envelope} (apps/web, UNN-520) composes over this schema and inherits the
 * exclusion.
 */
export const startCombatEventSchema = z.object({
  kind: z.literal("startCombat"),
  advantage: z.enum(COMBAT_ADVANTAGES),
  firstSide: z.enum(COMBAT_SIDES),
})

export const removeParticipantEventSchema = z.object({
  kind: z.literal("removeParticipant"),
  participantId: participantIdSchema,
})

export const combatEventSchema = z.discriminatedUnion("kind", [
  startCombatEventSchema,
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
  removeParticipantEventSchema,
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
 * One schema-backed encounter event. Application boundaries may expose a
 * strict subset; the command action accepts only start/add/remove after UNN-656.
 */
export type CombatEvent = z.infer<typeof combatEventSchema>

/**
 * The materialized setup an `addParticipant` event carries (CD4/CD5) — a
 * {@link import("./session-factory").ParticipantSetup} with its `source`
 * **flattened to a required `entity`** (a `{ catalog }` arm is structurally absent,
 * so the reducer stays catalog-free by type). A mid-round joiner always enters as
 * already-acted (R6.2), so this setup carries no `hasActed` — the reducer hardcodes it.
 */
export type AddParticipantSetup = z.infer<typeof addParticipantSetupSchema>

// --- Per-family aliases — Extract views over the single source ----------------

/**
 * `startCombat` opens the encounter: the DM declares the opening `advantage` and
 * which side acts first. The reducer records both **verbatim** (no normalisation,
 * R2.1) and is a no-op once `advantage` is non-null (R2.2). Resolving `firstSide`
 * from the declared advantage belongs to
 * {@link import("./initiative").resolveFirstSide} — not the reducer, and not each
 * start-combat surface; the DB `draft → live` status flip is the shell's job.
 */
export type StartCombatEvent = Extract<CombatEvent, { kind: "startCombat" }>

/** `draftCombatant` starts a participant's turn: makes them the `currentActorId`,
 *  resets their action-economy consumption, and clears their Downed ailment
 *  (R4). A no-op for an unknown id; never blocks an ineligible pick. */
export type DraftCombatantEvent = Extract<
  CombatEvent,
  { kind: "draftCombatant" }
>

/** `endTurn` ends the current actor's turn: increments their
 *  `turnsTakenThisRound` and ticks **only their** condition durations (R5). The
 *  actor stays `currentActorId`; a no-op when there is no/unmatched actor. */
export type EndTurnEvent = Extract<CombatEvent, { kind: "endTurn" }>

/**
 * Round-lifecycle + mid-round roster events (R6). `advanceRound` rolls to the
 * next round (increment `round`, null the actor, reset every
 * `turnsTakenThisRound`). `addParticipant` appends a fresh participant entering
 * as already-acted (queued for the next round). `removeParticipant` drops one +
 * nulls the actor if it was current — it does **NOT** sever engagement (R6.3,
 * the Tier-3 occupancy-prune obligation). `setSide` flips a participant's
 * allegiance side.
 */
export type RosterEvent = Extract<
  CombatEvent,
  { kind: "advanceRound" | "addParticipant" | "removeParticipant" | "setSide" }
>

/**
 * DM-override events (R7) — unconditional corrections to the turn-loop fields the
 * selectors derive from. `setCurrentActor` writes `currentActorId` even for an
 * unknown id (guides, never rejects). `setActed` maps an acted-boolean onto the
 * `turnsTakenThisRound` count (`hasActed ? 1 : 0`; SUPERSEDE R7.2). `setRound`
 * writes `round` with no clamp.
 */
export type OverrideEvent = Extract<
  CombatEvent,
  { kind: "setCurrentActor" | "setActed" | "setRound" }
>

/**
 * Battle-condition overlay events (R8) — the axis *state* plus *how long* it
 * lasts. `adjustBattleConditionAxis` nudges one tri-state axis and drives its
 * clock (same direction **extends**, flip **resets**, `clear`→neutral+drop);
 * `turns` defaults to {@link import("./vocab").DEFAULT_BATTLE_CONDITION_TURNS}.
 * `setBattleConditionFlag` toggles a single-use flag (no duration tick).
 */
export type BattleConditionEvent = Extract<
  CombatEvent,
  { kind: "adjustBattleConditionAxis" | "setBattleConditionFlag" }
>

/** Ailment overlay events (R9) — `setAilment` adds a key idempotently;
 *  `clearAilment` removes one. Permissive; a no-op for an unknown id. */
export type AilmentEvent = Extract<
  CombatEvent,
  { kind: "setAilment" | "clearAilment" }
>

/**
 * Counter overlay events (R10) — `adjustCounter` nudges a named tally by a signed
 * `delta` (floored at 0, key deleted at 0); `clearCounter` removes it outright.
 * Delta-not-absolute so back-to-back nudges merge against the loaded session.
 */
export type CounterEvent = Extract<
  CombatEvent,
  { kind: "adjustCounter" | "clearCounter" }
>

/** `adjustActionEconomy` (R11) nudges one per-turn action's consumption by a
 *  signed `delta` (floored at 0, unbounded above) — so a combatant can consume 2+
 *  of an action type (Tarantella, Follow-Ups). Delta-not-absolute (mirrors
 *  `adjustCounter`); allowance stays the DM/selector's call. Non-enforcing; a
 *  no-op for an unknown id. */
export type ActionEconomyEvent = Extract<
  CombatEvent,
  { kind: "adjustActionEconomy" }
>

/** The total reducer now consumes exactly the schema-backed public vocabulary. */
export type SessionEvent = CombatEvent
