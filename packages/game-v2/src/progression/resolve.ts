import {
  type AffinityEffect,
  type CombatantEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type {
  AttributeScores,
  PartialAffinityChart,
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
 * The **layered `resolve`** (D8/D30/D34–D37). Deps-first curried over the catalog
 * slice it touches (`getArchetype`), then `(entity, context?) → ResolvedEntity` —
 * pure, `Entity → Entity` (authored → effective), emitting only the resolved
 * capability read-units the entity carries (D30).
 *
 * **One uniform fold for every entity (D37):** each derivable capability folds its
 * authored `base` → the layers present on the entity (`Archetypes` → archetype
 * attributes/affinities; `Progression` → the path/level HP/SP formula) → the delta
 * effects (mastery/manual/zone now; equipment/mechanic with their PRs), then derives
 * the depletion **current** against the final maxima. There is **no form concept
 * here** — a form-swap is a prior `Entity → Entity` transform ({@link applyForm}),
 * so a natural entity and a shapechanged one flow through this *same* path.
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
      resources,
      exhaustion,
    } = entity.components
    const zoneEffects = context.zoneEffects ?? []

    const activeArchetypeBase = archetypes?.active
      ? deps.getArchetype(archetypes.active)
      : undefined

    // The delta pool, built once (PR2 sources: mastery, manual, context attribute
    // effects) — additive buffs that apply on top of the intrinsic statblock (D18
    // delta). Mastery reads the whole roster, so it survives a form-swap (which only
    // detaches the *active* Archetype's statline — see applyForm).
    const pool: BonusPool = sumBonuses(
      masteryBonuses(
        archetypes?.roster ?? [],
        (key) => deps.getArchetype(key)?.mastery
      ),
      manualBonusPool(manualBonuses ?? {}),
      attributeEffectBonuses(zoneEffects)
    )
    const candidates = zoneEffects.filter(isAffinityEffect)

    const components: ResolvedEntity["components"] = {}

    if (attributes) {
      // base + archetype layer + delta pool, summed and clamped in one pass.
      components.attributes = computeAttributes(
        attributes.base,
        activeArchetypeBase?.attributes,
        pool
      )
    }

    if (affinities) {
      // The intrinsic chart (entity base overridden per-type by the active Archetype)
      // is the fallback; candidates from later layers override it (D18 later-wins).
      components.affinities = computeAffinityChart(
        { ...affinities.base, ...activeArchetypeBase?.affinities },
        candidates
      )
    }

    if (vitals) {
      // Final maxHP through the layers, THEN derive currentHP from the authored,
      // form-independent `damage` (D9 continuity). Over-max (negative `damage`) floats
      // currentHP above maxHP; overkill floors it at 0 without losing stored `damage`.
      const maxHP = computeMaxHP(progression, vitals, pool)
      components.vitals = {
        maxHP,
        currentHP: Math.max(0, maxHP - vitals.damage),
      }
    }

    if (skillPool) {
      const maxSP = computeMaxSP(progression, skillPool, pool)
      components.skillPool = {
        maxSP,
        currentSP: Math.max(0, maxSP - skillPool.spSpent),
      }
    }

    // Dice maxima derive from level — present for a progression-bearing PC (a
    // shapechanged entity drops Progression, so it resolves no dice; they're a
    // rest resource of the true self). Current = max − used (used 0 absent Resources).
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
}

/**
 * A **form statblock** (D8 layer 2) — the complete intrinsic stats of a swapped
 * form (Shapechanger's bear, Nyx's Arcana). A form is a *full creature*, so it
 * carries its own Attributes, Affinity chart, and HP/SP maxima; it does **not**
 * carry depletion (that rides the durable entity) or rest resources (those belong
 * to the true self). PR4 sources this from the active form-swap Mechanic's catalog
 * definition; PR3 fixture-tests the merge.
 */
export interface FormStatblock {
  attributes: AttributeScores
  affinities: PartialAffinityChart
  hp: number
  sp: number
}

/**
 * The **form layer** as a pure `Entity → Entity` transform (D8 layer 2): overlay a
 * form's statblock onto an entity, producing the effective entity a normal
 * `resolve` then derives — "the base is a form; a form-swap provides a new base."
 *
 * The merge is **field-level** where a component bundles a base with depletion:
 * `vitals`/`skillPool` take the form's `base` (the new max) but keep the entity's
 * `damage`/`spSpent`, so spends carry across forms and `currentHP`/`currentSP`
 * reconcile against the new max with no policy (D9). `archetypes.active` is detached
 * (the form replaces the active Archetype's statline) while `roster` survives (so
 * Mastery still applies), and `progression` is dropped (the form's `base` *is* the
 * absolute max — no path layer to double-count; the true self's dice don't resolve
 * while transformed). Only capabilities the entity already carries are touched.
 */
export function applyForm(entity: Entity, form: FormStatblock): Entity {
  const components: Entity["components"] = { ...entity.components }
  delete components.progression

  if (components.attributes) components.attributes = { base: form.attributes }
  if (components.affinities) components.affinities = { base: form.affinities }
  if (components.vitals) {
    components.vitals = { ...components.vitals, base: form.hp }
  }
  if (components.skillPool) {
    components.skillPool = { ...components.skillPool, base: form.sp }
  }
  if (components.archetypes) {
    components.archetypes = { ...components.archetypes, active: null }
  }

  return { id: entity.id, components }
}
