import type { z } from "zod/v4"

import type { StatComputationCharacter } from "../character"
import type {
  AffinityEffect,
  AttackRollEffect,
  AttributeEffect,
} from "../combat"

/**
 * Per-Archetype unique mechanic vocabulary. Each Archetype with a unique
 * mechanic (Warrior's Perfection, Knight's Valor, Healer's Path of Dawn,
 * Mage's Stains, future Lineages) provides a {@link MechanicDefinition}; the
 * registry in {@link ./index} composes them.
 *
 * Two complementary pathways are supported:
 *
 * 1. **Effects** (`effects`) — additive, declarative modifiers that flow through
 *    the existing item/passive-Skill pipeline (see {@link ../effects}). Most
 *    mechanics live here. Perfection emits an {@link AttackRollEffect}; Valor's
 *    stage-3+ Affinity changes emit {@link AffinityEffect}s.
 *
 * 2. **Transform** (`transform`) — a wholesale character-rewrite escape hatch
 *    reserved for mechanics that can't be expressed as additive Effects (the
 *    Shapeshifter Lineage swaps affinities + attributes + active Skills as
 *    one). The field exists in the contract from day one so the shape is
 *    established; the engine call site lands alongside the first mechanic
 *    that uses it. None of the four MVP mechanics need it today.
 */

/** Effect kinds a mechanic may emit through the existing engine pipeline. */
export type MechanicEffect = AffinityEffect | AttributeEffect | AttackRollEffect

export interface MechanicEffectContext {
  /** The pure engine input. Mechanics may read e.g. attribute scores from it
   *  by re-running pure computes; they must not mutate it. */
  stats: StatComputationCharacter
}

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
   * Replacement / wholesale-rewrite escape hatch. Not wired into the engine
   * pipeline yet — the call site will be added alongside the first mechanic
   * that needs it (Shapeshifter Lineage). Declared here so the contract is
   * established and the shape is reviewable; refine the parameter/return type
   * when the first user lands.
   */
  transform?: unknown

  /** Encounter-reset behavior. Consumed by the future combat tracker and the
   *  Full Rest sweep once write infrastructure lands. */
  resetOn: "encounter" | "rest" | "never"
}
