import {
  type AffinityEffect,
  type CombatantEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  addScores,
  attributeEffectBonuses,
  baseAffinities,
  baseAttributes,
  computeAffinityChart,
  computeAttributes,
  computeMaxHitDice,
  computeMaxSkillDice,
  manualBonusPool,
  masteryBonuses,
  pathMaxHP,
  pathMaxSP,
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
 * The **base-layer `resolve`** (D8 layer 1, D30, D34–D37). Deps-first curried over
 * the catalog slice it touches (`getArchetype`), then `(entity, context?) →
 * ResolvedEntity` — pure, `Entity → Entity` (authored → effective). It emits
 * resolved **capability components** (no god struct, D30): only those the entity
 * carries.
 *
 * **One uniform fold for every entity (D37):** each derivable capability folds its
 * authored `base` → the layers present on the entity (`Archetypes` → archetype
 * attributes/affinities; `Progression` → the path/level HP/SP formula) → the
 * effect layers (manual/mastery/zone now; equipment/passive/mechanic with their
 * PRs). No `source: derived | flat` fork — a PC (base zeros/0, with the layer
 * components) and an enemy (authored base, without them) flow through the *same*
 * path, and both receive effects. No depletion yet (PR3).
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

    // The bonus pool, built once (PR2 sources: mastery, manual, context attribute
    // effects). Shared across attributes + maxHP + maxSP.
    const pool = sumBonuses(
      masteryBonuses(
        archetypes?.roster ?? [],
        (key) => deps.getArchetype(key)?.mastery
      ),
      manualBonusPool(manualBonuses ?? {}),
      attributeEffectBonuses(zoneEffects)
    )

    const components: ResolvedEntity["components"] = {}

    // One uniform fold for every entity (D37): base → layers present on the
    // entity → effects. A PC's base is zeros/neutral/0 and the Archetypes /
    // Progression layers supply its real values; an enemy carries an authored base
    // and no such layers — but both still receive the effect layers.

    if (attributes) {
      // base + archetype layer (additive), then the bonus pool, clamped.
      const withArchetype = addScores(
        attributes.base,
        baseAttributes(activeBase?.attributes)
      )
      components.attributes = computeAttributes(withArchetype, pool)
    }

    if (affinities) {
      // base chart, overridden per-type by the archetype layer, then candidate
      // effects resolve by precedence over that.
      const baseChart = activeBase
        ? { ...affinities.base, ...activeBase.affinities }
        : affinities.base
      components.affinities = computeAffinityChart(
        baseAffinities(baseChart),
        zoneEffects.filter(isAffinityEffect)
      )
    }

    if (vitals) {
      const progressionHP = progression
        ? pathMaxHP(progression.pathChoice, progression.level)
        : 0
      components.vitals = {
        maxHP: Math.round(vitals.base + progressionHP + pool.hp),
      }
    }

    if (skillPool) {
      const progressionSP = progression
        ? pathMaxSP(progression.pathChoice, progression.level)
        : 0
      components.skillPool = {
        maxSP: Math.round(skillPool.base + progressionSP + pool.sp),
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
