import {
  resolveAttackRoll,
  resolveDamageBonuses,
  termLabel,
  type ScalerContext,
} from "@workspace/game-v2/combat"
import type { GameEngine } from "@workspace/game-v2/composition"
import { intrinsicAttackRollContext } from "@workspace/game-v2/items"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { ResolveContext } from "@workspace/game-v2/resolve"
import {
  hydrateSkill,
  resolveTalents,
  type CharacterLookups,
  type RawCharacterInputs,
} from "@workspace/game/engine"
import type { HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import type { CombatContext } from "@workspace/game/foundation/character/state"

import { rawInputsToEntity } from "@/lib/game-v2/raw-inputs-to-entity"

/**
 * The **v2-backed sheet derivation** (UNN-533, PR11a) — the same
 * `(raw, context?) → HydratedCharacter` contract as v1's
 * `deriveHydratedCharacter`, with every derived field computed by the v2 engine:
 * `rawInputsToEntity` → `resolveEntity` → this projection. It lives in `apps/web`
 * because it holds both engines at once (v2 is independence-gated against
 * `@workspace/game`), and it is deliberately a *projection*, not a re-derivation —
 * the only logic here is field mapping:
 *
 * - **Passthrough** (row columns + child rows) spreads exactly as v1 does; the
 *   current pools (`currentHP`/`currentSP`, dice remaining) stay row columns —
 *   the signed-depletion projection belongs to the storage cutover, not this
 *   read path.
 * - **Derived stats** read the resolved capability read-units
 *   (`attributes`/`affinities`/`vitals`/`skillPool`/`resources`/`archetypes`).
 * - **Skills** join the v1 catalog Skill by key (the two catalogs share keys but
 *   not shapes — v2 Skills are facet-composed, UNN-506) and attach v2's resolved
 *   Attack Roll / damage bonuses through v1's own `hydrateSkill`, so the
 *   distributed `HydratedSkill` narrowing and the cost policy stay v1-defined.
 * - **Weapon readouts** resolve the equipped weapon's intrinsic attack with the
 *   pure v2 combat resolvers — mechanically a Skill attack, same machinery.
 *
 * `CombatContext.zoneEffects` feeds v2's `ResolveContext.effects` directly: the
 * two `CombatantEffect` unions are the same schema on both sides (the golden
 * master authors one effect list and hands it to both engines).
 */
export function createDeriveHydratedCharacterV2(
  v1: CharacterLookups,
  v2: Pick<GameEngine, "resolveEntity" | "resolveBasicAttack">
) {
  return (
    raw: RawCharacterInputs,
    context?: CombatContext
  ): HydratedCharacter => {
    const { row, archetypeRows, inventoryRows, knives, chains } = raw
    const partyComposition = context?.partyComposition ?? null

    const entity = rawInputsToEntity(raw)
    const resolveContext: ResolveContext = {
      partyComposition,
      effects: context?.zoneEffects ?? [],
    }
    const resolved = v2.resolveEntity(entity, resolveContext)
    const components = resolved.components

    const maxHP = read(components, "vitals").maxHP
    const resources = read(components, "resources")
    const scaler: ScalerContext = {
      partyComposition,
      activeLineage: components.archetypes?.activeLineage ?? null,
    }

    const basicAttack = v2.resolveBasicAttack(entity, null)
    const weaponContext = basicAttack
      ? intrinsicAttackRollContext(basicAttack.attack)
      : null

    return {
      ...row,
      archetypeRows,
      knives,
      chains,
      talents: resolveTalents(
        row.gainedTalents,
        components.archetypes?.active ?? null,
        v1
      ),
      inventory: inventoryRows.map((inventoryRow) => ({
        ...inventoryRow,
        item: v1.getItem(inventoryRow.catalogItemKey),
      })),
      activeArchetypeKey: components.archetypes?.active ?? null,
      attributes: read(components, "attributes"),
      maxHP,
      maxSP: read(components, "skillPool").maxSP,
      maxHitDice: resources.maxHitDice,
      maxSkillDice: resources.maxSkillDice,
      affinityChart: read(components, "affinities"),
      weaponAttackRoll: weaponContext
        ? resolveAttackRoll(weaponContext, resolved, scaler)
        : null,
      weaponDamageBonuses: weaponContext
        ? resolveDamageBonuses(weaponContext, resolved).map(
            ({ source, term }) => ({ source, label: termLabel(term) })
          )
        : [],
      activeMechanic: components.activeMechanics?.[0] ?? null,
      skills: (components.skills ?? []).flatMap((resolvedSkill) => {
        const skill = v1.getSkill(resolvedSkill.skill.key)
        if (!skill) return []
        return hydrateSkill(
          skill,
          maxHP,
          resolvedSkill.resolvedAttackRoll,
          resolvedSkill.resolvedDamageBonuses.map(({ source, term }) => ({
            source,
            label: termLabel(term),
          }))
        )
      }),
    }
  }
}

/**
 * Reads a resolved capability read-unit that is **always present for a PC**:
 * `rawInputsToEntity` projects every stat capability (attributes, affinities,
 * vitals, skillPool, resources), so `resolve` emits each of them. The registry
 * types stay `Partial` (an entity carries only the capabilities it has — D30),
 * hence this one boundary check instead of scattered non-null assertions.
 */
function read<K extends keyof ResolvedEntity["components"]>(
  components: ResolvedEntity["components"],
  key: K
): NonNullable<ResolvedEntity["components"][K]> {
  const value = components[key]
  if (value === undefined) {
    throw new Error(`resolve emitted no "${key}" read-unit for a PC entity`)
  }
  return value
}
