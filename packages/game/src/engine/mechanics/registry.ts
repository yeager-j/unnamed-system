import { enchantment } from "@workspace/game/engine/mechanics/bard/enchantment"
import { frenzy } from "@workspace/game/engine/mechanics/berserker/frenzy"
import { pathOfDawn } from "@workspace/game/engine/mechanics/healer/path-of-dawn"
import { valor } from "@workspace/game/engine/mechanics/knight/valor"
import { stains } from "@workspace/game/engine/mechanics/mage/stains"
import { thiefsInsight } from "@workspace/game/engine/mechanics/thief/thiefs-insight"
import type {
  MechanicDefinition,
  MechanicEffect,
  MechanicEffectContext,
} from "@workspace/game/engine/mechanics/types"
import { pathOfDusk } from "@workspace/game/engine/mechanics/warlock/path-of-dusk"
import { perfection } from "@workspace/game/engine/mechanics/warrior/perfection"
import type {
  MechanicKind,
  MechanicState,
} from "@workspace/game/foundation/mechanics/schema"

/**
 * The Archetype-mechanic registry. Each module owns its own state shape,
 * initial state, and (when relevant) the Effects it emits while its owning
 * Archetype is active. New mechanics are added by importing them above and
 * appending an entry to {@link MECHANICS}; no call site in the engine needs to
 * change.
 *
 * MVP roster:
 *  - Perfection — Warrior
 *  - Valor — Knight
 *  - Path of Dawn — Healer
 *  - Path of Dusk — Warlock
 *  - Stains — Mage
 *  - Thief's Insight — Thief
 *  - Enchantment — Bard
 *  - Frenzy — Berserker
 */

const MECHANIC_LIST = [
  perfection,
  valor,
  pathOfDawn,
  pathOfDusk,
  stains,
  thiefsInsight,
  enchantment,
  frenzy,
] as const

type MechanicMap = {
  [K in MechanicKind]: MechanicDefinition<Extract<MechanicState, { kind: K }>>
}

export const MECHANICS_BY_KIND = Object.fromEntries(
  MECHANIC_LIST.map((mechanic) => [mechanic.kind, mechanic])
) as MechanicMap

export const MECHANICS: ReadonlyArray<MechanicDefinition<MechanicState>> =
  MECHANIC_LIST as ReadonlyArray<MechanicDefinition<MechanicState>>

/**
 * The mechanic definition for `kind`, or `undefined` when the key is unknown.
 * Returns the loosely-typed `MechanicDefinition<MechanicState>` because the
 * caller usually doesn't know the specific state type at compile time; pair
 * with {@link getTypedMechanic} when narrowing is needed.
 */
export function getMechanic(
  kind: string
): MechanicDefinition<MechanicState> | undefined {
  return MECHANICS.find((mechanic) => mechanic.kind === kind)
}

/**
 * Strongly-typed mechanic lookup for callers that already have a narrowed
 * `MechanicKind`. Returns the per-state definition so callers can pass
 * matching state without a cast.
 */
export function getTypedMechanic<K extends MechanicKind>(
  kind: K
): MechanicDefinition<Extract<MechanicState, { kind: K }>> {
  return MECHANICS_BY_KIND[kind]
}

/**
 * The initial state for `kind`, or `undefined` when the key is unknown. Read
 * paths use this to coerce a null `mechanicState` row into a renderable
 * empty state without persisting one.
 */
export function initialStateFor(kind: string): MechanicState | undefined {
  const mechanic = getMechanic(kind)
  return mechanic ? (mechanic.initialState() as MechanicState) : undefined
}

/**
 * Effects emitted by the active mechanic given its persisted state. Returns
 * an empty array when the mechanic has no `effects` method or when the
 * mechanic key is unknown — call sites can use the result directly without
 * defensive checks.
 */
export function mechanicEffectsFor(
  kind: string,
  state: MechanicState,
  ctx: MechanicEffectContext
): MechanicEffect[] {
  const mechanic = getMechanic(kind)
  if (!mechanic?.effects) return []
  return mechanic.effects(state, ctx)
}
