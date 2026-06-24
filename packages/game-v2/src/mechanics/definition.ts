import type { z } from "zod/v4"

import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { MechanicKind } from "@workspace/game-v2/kernel/vocab/mechanics"

/**
 * The behavior contract for a unique Archetype mechanic, re-homed into v2's
 * `mechanics` domain. Each mechanic provides a {@link MechanicDefinition}; the
 * {@link import("./registry").MECHANICS} registry composes them.
 *
 * This is the mechanic **behavior** contract the engine implements — it sits
 * beside the behavior modules and registry that consume it, not in the kernel
 * (which owns only the neutral vocab the discriminants come from) and not the
 * persisted state (that is `./mechanics.schema` + each module's state schema).
 *
 * Two engine-visible pathways, both optional and mutually independent:
 *
 * 1. **Effects** ({@link MechanicDefinition.effects}) — additive declarative
 *    {@link MechanicEffect}s folded through `resolve`'s delta channels (Perfection
 *    emits an attack-roll bonus; Valor an affinity override; Frenzy a damage
 *    bonus). The attack-roll/damage effects are *surfaced* by `resolve` for the
 *    PR7 resolvers to consume; the affinity/attribute ones are consumed in-fold.
 *
 * 2. **Active form** ({@link MechanicDefinition.activeForm}) — a form-swap
 *    mechanic's current form, returned as another entity's component bag (D38).
 *    `resolveEntity` merges it via `applyForm` **before** `resolve` (a pre-resolve
 *    transform, not an in-fold layer). This is the v2 replacement for v1's
 *    `transform` escape hatch, which is dropped: v2 has no `StatContext` for a
 *    field-replace to return (D34/D37), and a form *is* an entity, so you merge
 *    two entities rather than rewrite a slice. No MVP mechanic uses it yet (the
 *    Shapechanger Lineage will); the seam ships so it plugs in additively.
 */

/** The effect kinds a mechanic may emit — the kernel's source-agnostic union. */
export type MechanicEffect = CombatantEffect

export interface MechanicDefinition<TState> {
  /** Unique kebab-case identifier; the registry key and the state discriminant. */
  kind: MechanicKind

  /** Human-readable title shown in the widget header and info card. */
  displayName: string

  /** Single-sentence summary for the space-tight Combat-tab widget. */
  tagline: string

  /** Full prose for the Archetypes-tab info card. */
  description: string

  /** Zod validator for the mechanic's persisted state shape. */
  schema: z.ZodType<TState>

  /** Empty state for a fresh character; used when the row carries none. */
  initialState(): TState

  /**
   * Additive {@link MechanicEffect}s this mechanic contributes while it is the
   * active one. Returns `[]` when the current state contributes nothing. Omit for
   * a display-only mechanic (Path of Dawn/Dusk, Stains, Thief's Insight,
   * Elemental Larceny, Enchantment) — those carry state but emit no engine
   * effects (Enchantment's effect flows through the zone channel instead).
   */
  effects?(state: TState): MechanicEffect[]

  /**
   * The active form's component bag, or `null` when this mechanic is not currently
   * shapechanged. A form **is** another entity's components — a full-health
   * creature — so `resolveEntity` feeds the result straight to `applyForm` (D38).
   * No deps: a form-swap mechanic owns its forms; PR4 freezes only this seam, not
   * where real forms ultimately live. Omit for every non-form-swap mechanic (all 9
   * MVP mechanics omit it).
   */
  activeForm?(state: TState): Entity["components"] | null

  /** Encounter-reset behavior, enforced by the encounter-end sweep (`./reset`). */
  resetOn: "encounter" | "rest" | "never"
}
