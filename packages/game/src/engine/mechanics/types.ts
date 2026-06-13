import type { z } from "zod/v4"

import { type StatContext } from "@workspace/game/engine/character/stats/stats"
import {
  type AffinityEffect,
  type AttackRollEffect,
  type AttributeEffect,
  type DamageEffect,
} from "@workspace/game/foundation/combat/effects"

/**
 * Per-Archetype unique mechanic vocabulary. Each Archetype with a unique
 * mechanic (Warrior's Perfection, Knight's Valor, Healer's Path of Dawn,
 * Mage's Stains, future Lineages) provides a {@link MechanicDefinition}; the
 * registry in {@link ./registry} composes them.
 *
 * Lives in `engine` (not `foundation`): this is the mechanic **behavior**
 * contract the engine's mechanic modules implement — not persisted state (that
 * is `foundation/mechanics/schema`), not authored catalog data, and not UI. It
 * sits beside the behavior modules and registry that consume it.
 *
 * Two complementary pathways are supported:
 *
 * 1. **Effects** (`effects`) — additive, declarative modifiers that flow through
 *    the existing item/passive-Skill pipeline (see {@link ../../foundation/combat/effects}).
 *    Most mechanics live here. Perfection emits an {@link AttackRollEffect};
 *    Valor's stage-3+ Affinity changes emit {@link AffinityEffect}s; Frenzy
 *    emits a {@link DamageEffect}.
 *
 * 2. **Transform** (`transform`) — a wholesale character-rewrite escape hatch
 *    reserved for mechanics that can't be expressed as additive Effects (the
 *    Shapeshifter Lineage swaps affinities + attributes + active Skills as
 *    one). The field exists in the contract from day one so the shape is
 *    established; the engine call site lands alongside the first mechanic
 *    that uses it. None of the four MVP mechanics need it today.
 */

/** Effect kinds a mechanic may emit through the existing engine pipeline. */
export type MechanicEffect =
  | AffinityEffect
  | AttributeEffect
  | AttackRollEffect
  | DamageEffect

export interface MechanicEffectContext {
  /** The pure engine input. Mechanics may read e.g. attribute scores from it
   *  by re-running pure computes; they must not mutate it. */
  stats: StatContext
}

/**
 * The base fields a {@link MechanicDefinition.transform} may replace wholesale
 * on the freshly-hydrated {@link StatContext}. Every field is optional: a
 * transform overrides only the parts of the active form it swaps (Shapeshifter
 * replaces all three; a hypothetical attribute-only transform returns just
 * `baseAttributes`). A returned field **replaces** the Archetype-resolved value
 * outright — it is not merged element-wise and does not stack through the
 * Effect pipeline. Locked to the {@link StatContext} field types so the two
 * can't drift.
 */
export type MechanicStatTransform = Partial<
  Pick<StatContext, "baseAttributes" | "baseAffinities" | "activeSkills">
>

export interface MechanicDefinition<TState> {
  /** Unique kebab-case identifier matching the Archetype's `mechanic` key. */
  kind: string

  /** Human-readable title shown in the widget header and info card. */
  displayName: string

  /** Single-sentence summary shown on the Combat-tab widget where space is
   *  tight. */
  tagline: string

  /** Full prose used on the Archetypes-tab info card. */
  description: string

  /** Zod validator for the mechanic's persisted state shape. */
  schema: z.ZodType<TState>

  /** Empty state for a freshly initialized character; used when the row's
   *  `mechanicState` is null. */
  initialState(): TState

  /**
   * Additive Effects this mechanic contributes while its owning Archetype is
   * the active one. Returns an empty array when the state contributes nothing.
   * Omit when the mechanic has no engine-visible effects (Path of Dawn and
   * Stains are display-only until Skill-cast write paths land).
   */
  effects?(state: TState, ctx: MechanicEffectContext): MechanicEffect[]

  /**
   * Replacement / wholesale-rewrite escape hatch for mechanics that swap the
   * active form's base attributes, Affinity chart, and active Skills wholesale
   * — the planned Shapeshifter Lineage — which can't be expressed as additive
   * Effects. Invoked by {@link buildStatContext} right after hydration (via
   * `applyMechanicTransform`), receiving the mechanic's current `state` and the
   * assembled {@link StatContext}, and returning the base fields to replace.
   * Omit it (every MVP mechanic does) to leave the resolved Archetype base
   * untouched. The compute functions read the post-transform base, so they need
   * no knowledge of transforms.
   */
  transform?(state: TState, context: StatContext): MechanicStatTransform

  /** Encounter-reset behavior. Consumed by the future combat tracker and the
   *  Full Rest sweep once write infrastructure lands. */
  resetOn: "encounter" | "rest" | "never"
}
