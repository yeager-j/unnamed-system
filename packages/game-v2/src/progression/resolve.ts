import {
  type AffinityEffect,
  type CombatantEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type {
  Affinity,
  AttributeScores,
  DamageType,
} from "@workspace/game-v2/kernel/vocab"
import {
  attributeEffectBonuses,
  computeAffinityChart,
  computeAttributes,
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  manualBonusPool,
  masteryBonuses,
  sumBonuses,
  type BonusPool,
} from "@workspace/game-v2/progression/stats"
import { getExhaustionLevel } from "@workspace/game-v2/resources/exhaustion-table"

/**
 * Off-entity inputs to a resolve (encounter-scoped). Defaults are inert, so an
 * off-encounter resolve is pure over the entity alone (A8/A9). A **form is not**
 * here — it is on-entity state (the active form-swap Mechanic), threaded through
 * {@link ResolveLayers}, not this off-entity channel.
 */
export interface ResolveContext {
  /** Combat-context effects (e.g. a Zone Enchantment), folded as a bonus source. */
  zoneEffects?: readonly CombatantEffect[]
}

/**
 * An **active form / Arcana** (D8 layer 2): a form-swap Mechanic's catalog
 * definition, which *overrides* the resolved base capabilities. Every field is
 * optional — a form touches only what it changes. `attributes` and `maxHP`/`maxSP`
 * **replace** the base (and the Archetype/Progression layer); `affinities` override
 * per damage type, winning outright over base and candidates (D18 override). The
 * bonus pool (deltas — buffs) still applies on top.
 *
 * PR3 builds the override composition; the form's *source* is the entity's active
 * form-swap Mechanic, which PR4 will read to produce this — until then it enters
 * through {@link ResolveLayers} (today only fixtures supply it).
 */
export interface ActiveForm {
  attributes?: AttributeScores
  affinities?: Partial<Record<DamageType, Affinity>>
  maxHP?: number
  maxSP?: number
}

/**
 * The transform layers above the base (D8). PR3 fills only the **form** layer; the
 * inheritance / equipment / mechanic-delta / combat-overlay layers are inert until
 * their PRs (PR4–PR8) plug real content in. Modelled as one bag so the fold's
 * ordering is fixed in code and each PR widens this shape by one field.
 */
export interface ResolveLayers {
  form?: ActiveForm
}

function isAffinityEffect(effect: CombatantEffect): effect is AffinityEffect {
  return effect.type === "affinity"
}

/**
 * The layered fold over one entity (D8/D30/D34–D37). Computes each capability's
 * **final maximum through the layers** (base → form override → bonus-pool deltas),
 * then derives the depletion **current** (`currentHP`/`currentSP`/current dice)
 * against that final maximum and the authored `damage`/`spSpent`/`*Used`. Reading
 * depletion only after the maxima are final is what makes form-swap HP continuity
 * fall out with no special policy (D9): a form moves `maxHP` under the
 * form-independent `damage`, and `currentHP` reconciles.
 */
function foldCapabilities(
  deps: Pick<GameData, "getArchetype">,
  entity: Entity,
  layers: ResolveLayers,
  context: ResolveContext
): ResolvedEntity {
  const {
    progression,
    archetypes,
    manualBonuses,
    attributes,
    affinities,
    vitals,
    skillPool,
    resources,
    exhaustion,
  } = entity.components
  const { form } = layers
  const zoneEffects = context.zoneEffects ?? []

  const activeArchetypeBase = archetypes?.active
    ? deps.getArchetype(archetypes.active)
    : undefined

  // The delta pool, built once (PR2 sources: mastery, manual, context attribute
  // effects) — additive buffs that apply on top of every layer (D18 delta).
  const pool: BonusPool = sumBonuses(
    masteryBonuses(
      archetypes?.roster ?? [],
      (key) => deps.getArchetype(key)?.mastery
    ),
    manualBonusPool(manualBonuses ?? {}),
    attributeEffectBonuses(zoneEffects)
  )

  const components: ResolvedEntity["components"] = {}

  if (attributes) {
    // Override: an active form replaces the entity base + Archetype layer outright;
    // the delta pool still adds. No form ⇒ base + Archetype layer + pool (PR2).
    components.attributes = form?.attributes
      ? computeAttributes(form.attributes, pool)
      : computeAttributes(
          attributes.base,
          activeArchetypeBase?.attributes,
          pool
        )
  }

  if (affinities) {
    // Override: the form's per-type affinities win outright (the `overrides` arm of
    // the chart fold); otherwise base → Archetype layer → strongest candidate (PR2).
    components.affinities = computeAffinityChart(
      affinities.base,
      activeArchetypeBase?.affinities,
      zoneEffects.filter(isAffinityEffect),
      form?.affinities
    )
  }

  if (vitals) {
    // Final maxHP through the layers, THEN derive currentHP from the authored,
    // form-independent `damage` (D9 continuity). Over-max (negative `damage`) floats
    // currentHP above maxHP; overkill floors it at 0 without losing stored `damage`.
    const maxHP =
      form?.maxHP !== undefined
        ? Math.round(form.maxHP + pool.hp)
        : computeMaxHP(progression, vitals, pool)
    components.vitals = { maxHP, currentHP: Math.max(0, maxHP - vitals.damage) }
  }

  if (skillPool) {
    const maxSP =
      form?.maxSP !== undefined
        ? Math.round(form.maxSP + pool.sp)
        : computeMaxSP(progression, skillPool, pool)
    components.skillPool = {
      maxSP,
      currentSP: Math.max(0, maxSP - skillPool.spSpent),
    }
  }

  // Dice maxima derive from level — present for a progression-bearing PC. Current =
  // max − used; `used` is 0 when the entity carries no Resources component.
  if (progression) {
    const maxHitDice = computeMaxHitDice(progression.level)
    const maxSkillDice = computeMaxSkillDice(progression.level)
    components.resources = {
      maxHitDice,
      currentHitDice: Math.max(0, maxHitDice - (resources?.hitDiceUsed ?? 0)),
      maxSkillDice,
      currentSkillDice: Math.max(
        0,
        maxSkillDice - (resources?.skillDiceUsed ?? 0)
      ),
    }
  }

  // Exhaustion: a durable level resolved to its table entry (D27). Effects are
  // table-derived; the rulebook 1–6 effects are unshipped, so none fold into the
  // pool yet — when they ship they enter as one more BonusPool source above.
  if (exhaustion) {
    components.exhaustion = getExhaustionLevel(exhaustion.level)
  }

  return { id: entity.id, components }
}

/**
 * The composed **`resolve`** (D33). Deps-first curried over the catalog slice it
 * touches (`getArchetype`), then `(entity, context?) → ResolvedEntity` — pure,
 * `Entity → Entity` (authored → effective), emitting only the resolved capability
 * read-units the entity carries (D30).
 *
 * The non-base layers are inert today: `resolve` passes **no form** (PR4 will source
 * one from the entity's active form-swap Mechanic and feed the same fold). Tests and
 * PR4 use {@link createResolveWithForm} to inject the form layer.
 */
export function createResolve(deps: Pick<GameData, "getArchetype">) {
  return function resolve(
    entity: Entity,
    context: ResolveContext = {}
  ): ResolvedEntity {
    return foldCapabilities(deps, entity, {}, context)
  }
}

/**
 * The form-injecting seam over the same fold — the transition entry PR3 fixtures use
 * to exercise the override layer + form-swap continuity, and the path PR4 routes its
 * entity-derived form through. Kept separate from {@link createResolve} so the public
 * `resolve(entity, context)` signature carries no inert layer parameter.
 */
export function createResolveWithForm(deps: Pick<GameData, "getArchetype">) {
  return function resolveWithForm(
    entity: Entity,
    form: ActiveForm,
    context: ResolveContext = {}
  ): ResolvedEntity {
    return foldCapabilities(deps, entity, { form }, context)
  }
}
