import type { MechanicKind } from "@workspace/game-v2/kernel/vocab/mechanics"
import { enchantment } from "@workspace/game-v2/mechanics/bard/enchantment"
import { frenzy } from "@workspace/game-v2/mechanics/berserker/frenzy"
import type {
  MechanicDefinition,
  MechanicEffect,
} from "@workspace/game-v2/mechanics/definition"
import { pathOfDawn } from "@workspace/game-v2/mechanics/healer/path-of-dawn"
import { valor } from "@workspace/game-v2/mechanics/knight/valor"
import { stains } from "@workspace/game-v2/mechanics/mage/stains"
import type { MechanicState } from "@workspace/game-v2/mechanics/mechanics.schema"
import { elementalLarceny } from "@workspace/game-v2/mechanics/thief/elemental-larceny"
import { thiefsInsight } from "@workspace/game-v2/mechanics/thief/thiefs-insight"
import { pathOfDusk } from "@workspace/game-v2/mechanics/warlock/path-of-dusk"
import { perfection } from "@workspace/game-v2/mechanics/warrior/perfection"

/**
 * The Archetype-mechanic registry (D17) — engine-owned behavior dispatch over the
 * closed {@link MechanicKind} union, **not** a `GameData` port (the existing
 * carve-out). Each module owns its state shape, initial state, and (when relevant)
 * the Effects it emits while active. A new mechanic is added by appending its
 * `kind` to the kernel vocab + its state schema to the union + its module here; no
 * call site in the engine changes.
 */
const MECHANIC_LIST = [
  perfection,
  valor,
  pathOfDawn,
  pathOfDusk,
  stains,
  thiefsInsight,
  elementalLarceny,
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
 * The mechanic definition for `kind`, or `undefined` for an unknown key. Returns
 * the loosely-typed `MechanicDefinition<MechanicState>` because the caller usually
 * doesn't know the specific state type; pair with {@link getTypedMechanic} when
 * narrowing is needed.
 */
export function getMechanic(
  kind: string
): MechanicDefinition<MechanicState> | undefined {
  return MECHANICS.find((mechanic) => mechanic.kind === kind)
}

/**
 * Strongly-typed lookup for a caller that already has a narrowed
 * {@link MechanicKind} — returns the per-state definition so matching state passes
 * without a cast.
 */
export function getTypedMechanic<K extends MechanicKind>(
  kind: K
): MechanicDefinition<Extract<MechanicState, { kind: K }>> {
  return MECHANICS_BY_KIND[kind]
}

/**
 * The initial state for `kind`, or `undefined` for an unknown key. Read paths use
 * this to coerce an absent persisted state into a renderable empty one without
 * persisting it.
 */
export function initialStateFor(kind: string): MechanicState | undefined {
  const mechanic = getMechanic(kind)
  return mechanic ? (mechanic.initialState() as MechanicState) : undefined
}

/**
 * Effects emitted by the mechanic `kind` given its persisted state. Returns `[]`
 * when the mechanic has no `effects` method or the key is unknown, so callers use
 * the result directly without defensive checks.
 */
export function mechanicEffectsFor(
  kind: string,
  state: MechanicState
): MechanicEffect[] {
  const mechanic = getMechanic(kind)
  if (!mechanic?.effects) return []
  return mechanic.effects(state)
}
