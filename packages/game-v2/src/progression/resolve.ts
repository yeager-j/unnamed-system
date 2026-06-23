import {
  type AffinityEffect,
  type CombatantEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Progression } from "@workspace/game-v2/progression/progression.schema"
import {
  attributeEffectBonuses,
  baseAffinities,
  baseAttributes,
  computeAffinityChart,
  computeAttributes,
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  manualBonusPool,
  masteryBonuses,
  sumBonuses,
} from "@workspace/game-v2/progression/stats"

/**
 * Off-entity inputs to a resolve (encounter-scoped). Defaults are inert, so an
 * off-encounter resolve is pure over the entity alone (A8/A9).
 */
export interface ResolveContext {
  /** Combat-context effects (e.g. a Zone Enchantment), folded as a bonus source. */
  zoneEffects?: readonly CombatantEffect[]
}

function isAffinityEffect(effect: CombatantEffect): effect is AffinityEffect {
  return effect.type === "affinity"
}

/**
 * The **base-layer `resolve`** (D8 layer 1, D30, D34/D35/D36). Deps-first curried
 * over the catalog slice it touches (`getArchetype`), then `(entity, context?) →
 * ResolvedEntity` — pure, `Entity → Entity` (authored → effective). It emits
 * resolved **capability components** (no god struct, D30): only those the entity
 * carries, each derived per its own `source` (D34).
 *
 * PR2 (UNN-500) is the base layer only: the six-source bonus pool with the
 * archetype/mastery/manual/context sources wired (equipment/passive/mechanic
 * gatherers and the form/inheritance fold layers land with their PRs), no
 * depletion (PR3). For a `derived` source it computes (PC); for `flat` it returns
 * the authored value (enemy — shape-complete, exercised when enemies land).
 */
export function createResolve(deps: Pick<GameData, "getArchetype">) {
  return function resolve(
    entity: Entity,
    context: ResolveContext = {}
  ): ResolvedEntity {
    const {
      progression,
      archetypes,
      manualBonuses,
      attributes,
      affinities,
      vitals,
      skillPool,
    } = entity.components
    const zoneEffects = context.zoneEffects ?? []

    const activeBase = archetypes?.active
      ? deps.getArchetype(archetypes.active)
      : undefined

    // The six-source bonus pool, built once (PR2 sources: mastery, manual,
    // context attribute effects). Shared across attributes + maxHP + maxSP.
    const pool = sumBonuses(
      masteryBonuses(
        archetypes?.roster ?? [],
        (key) => deps.getArchetype(key)?.mastery
      ),
      manualBonusPool(manualBonuses ?? {}),
      attributeEffectBonuses(zoneEffects)
    )

    // A `derived` pool max is computed from progression (path + level); there is
    // no sensible fallback maxHP without a path. A derived pool with no
    // Progression is malformed by construction (D35 — derived ⇒ Progression
    // present), so assert it loudly rather than silently drop the component.
    const progressionOrThrow = (): Progression => {
      if (!progression) {
        throw new Error(
          "resolve: a derived Vitals/SkillPool max requires a Progression component (D35)"
        )
      }
      return progression
    }

    const components: ResolvedEntity["components"] = {}

    if (attributes) {
      components.attributes =
        attributes.source.kind === "flat"
          ? attributes.source.scores
          : computeAttributes(baseAttributes(activeBase?.attributes), pool)
    }

    if (affinities) {
      components.affinities =
        affinities.source.kind === "flat"
          ? baseAffinities(affinities.source.chart)
          : computeAffinityChart(
              baseAffinities(activeBase?.affinities),
              zoneEffects.filter(isAffinityEffect)
            )
    }

    if (vitals) {
      if (vitals.max.kind === "flat") {
        components.vitals = { maxHP: vitals.max.value }
      } else {
        const prog = progressionOrThrow()
        components.vitals = {
          maxHP: computeMaxHP(prog.pathChoice, prog.level, pool.hp),
        }
      }
    }

    if (skillPool) {
      if (skillPool.max.kind === "flat") {
        components.skillPool = { maxSP: skillPool.max.value }
      } else {
        const prog = progressionOrThrow()
        components.skillPool = {
          maxSP: computeMaxSP(prog.pathChoice, prog.level, pool.sp),
        }
      }
    }

    // Dice maxima derive from level — present for a progression-bearing PC.
    if (progression) {
      components.resources = {
        maxHitDice: computeMaxHitDice(progression.level),
        maxSkillDice: computeMaxSkillDice(progression.level),
      }
    }

    return { id: entity.id, components }
  }
}
