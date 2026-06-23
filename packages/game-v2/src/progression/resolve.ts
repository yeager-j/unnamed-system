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
  computeMaxSkillDice,
  manualBonusPool,
  masteryBonuses,
  progressionMaxHP,
  progressionMaxSP,
  sumAttributeSources,
  sumBonuses,
  type BonusPool,
} from "@workspace/game-v2/progression/stats"
import { getExhaustionLevel } from "@workspace/game-v2/resources/exhaustion-table"

/**
 * Off-entity inputs to a resolve (encounter-scoped). Defaults are inert, so an
 * off-encounter resolve is pure over the entity alone (A8/A9). A form is **not**
 * here — it is on-entity state (the active form-swap Mechanic), expressed as the
 * {@link Form} `resolve` folds, not this off-entity channel.
 */
export interface ResolveContext {
  /** Combat-context effects (e.g. a Zone Enchantment), folded as a bonus source. */
  zoneEffects?: readonly CombatantEffect[]
}

/**
 * A **Form** — the base statblock layer of the fold (D8 layers 1–2 collapsed):
 * the capability values *before* the delta pool, candidates, and depletion apply.
 * Every entity is always *in* a form — its **natural form** ({@link naturalForm},
 * derived from its components) by default, or a swapped form when a form-swap
 * Mechanic is active (PR4), which {@link applyFormSwap} layers over the natural one.
 * "The base is a form; a form-swap provides a new base."
 *
 * Fields are presence-gated (only those for capabilities the entity carries), and
 * a swap is partial — it touches only what it changes. `attributes` is the
 * **unclamped** base sum (the clamp lands once in `resolveForm`, after the pool).
 */
export interface Form {
  attributes?: AttributeScores
  affinities?: PartialAffinityChart
  maxHP?: number
  maxSP?: number
}

function isAffinityEffect(effect: CombatantEffect): effect is AffinityEffect {
  return effect.type === "affinity"
}

/**
 * The entity's **natural form** (D8 layer 1 + D37): the base statblock derived
 * from its components, uniformly for every entity. A PC folds its `attributes`/
 * `affinities` base with the active Archetype and its `vitals`/`skillPool` base
 * with the Progression path/level formula; an enemy carries an authored base and
 * no Archetype/Progression, so it folds nothing extra — same code path. The delta
 * pool is **not** applied here; it folds in at `resolveForm` (D18 delta).
 */
export function naturalForm(
  deps: Pick<GameData, "getArchetype">,
  entity: Entity
): Form {
  const { attributes, affinities, vitals, skillPool, progression, archetypes } =
    entity.components

  const archetypeBase = archetypes?.active
    ? deps.getArchetype(archetypes.active)
    : undefined

  const form: Form = {}
  if (attributes) {
    form.attributes = sumAttributeSources(
      attributes.base,
      archetypeBase?.attributes
    )
  }
  if (affinities) {
    // The Archetype layer overrides the entity base per charted type (D37).
    form.affinities = { ...affinities.base, ...archetypeBase?.affinities }
  }
  if (vitals) form.maxHP = vitals.base + progressionMaxHP(progression)
  if (skillPool) form.maxSP = skillPool.base + progressionMaxSP(progression)
  return form
}

/**
 * Layers a (partial) form-swap over a base form (D8 layer 2 → "a form-swap provides
 * a new base"). Per-field **override**: a present field on `swap` replaces the
 * base's wholesale; **except** `affinities`, which merge per damage type so a form
 * can change a few affinities and inherit the rest. PR4's form-swap Mechanic
 * produces the `swap`; tests build one directly.
 */
export function applyFormSwap(base: Form, swap: Form): Form {
  return {
    attributes: swap.attributes ?? base.attributes,
    affinities: swap.affinities
      ? { ...base.affinities, ...swap.affinities }
      : base.affinities,
    maxHP: swap.maxHP ?? base.maxHP,
    maxSP: swap.maxSP ?? base.maxSP,
  }
}

/**
 * Resolves an active {@link Form} against an entity (D8/D30). Folds the delta layers
 * over the form — the bonus pool (mastery/manual/zone; equipment/mechanic join in
 * their PRs) and the affinity candidates — then derives the depletion **current**
 * (`currentHP`/`currentSP`/current dice) against the *final* maxima and the entity's
 * authored `damage`/`spSpent`/`*Used`. Reading depletion only after the maxima are
 * final is what makes form-swap HP continuity fall out with no policy (D9): a swap
 * moves `maxHP` under the form-independent `damage`, and `currentHP` reconciles.
 *
 * Emits only the resolved read-units the entity carries (D30). This is the seam PR4
 * routes its mechanic-derived form through.
 */
export function resolveForm(
  deps: Pick<GameData, "getArchetype">,
  form: Form,
  entity: Entity,
  context: ResolveContext = {}
): ResolvedEntity {
  const {
    progression,
    archetypes,
    manualBonuses,
    vitals,
    skillPool,
    resources,
    exhaustion,
  } = entity.components
  const zoneEffects = context.zoneEffects ?? []

  // Delta layers: the bonus pool (D18 delta) + the affinity candidates. Later PRs
  // add equipment/mechanic/overlay contributions to these same channels.
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

  if (form.attributes) {
    // Sum-then-clamp once: form base (override) + pool (delta) → clamp (C1).
    components.attributes = computeAttributes(form.attributes, pool)
  }

  if (form.affinities) {
    // Candidates override the form's Affinity per type (D18 — later layers win).
    components.affinities = computeAffinityChart(form.affinities, candidates)
  }

  if (vitals) {
    const maxHP = Math.round((form.maxHP ?? 0) + pool.hp)
    components.vitals = { maxHP, currentHP: Math.max(0, maxHP - vitals.damage) }
  }

  if (skillPool) {
    const maxSP = Math.round((form.maxSP ?? 0) + pool.sp)
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
 * Resolves the entity's **natural form** today. PR4 widens this one line to
 * `resolveForm(deps, applyFormSwap(naturalForm(...), formFor(entity)), ...)`, where
 * `formFor` reads the active form-swap Mechanic — the rest of the fold is unchanged.
 */
export function createResolve(deps: Pick<GameData, "getArchetype">) {
  return function resolve(
    entity: Entity,
    context: ResolveContext = {}
  ): ResolvedEntity {
    return resolveForm(deps, naturalForm(deps, entity), entity, context)
  }
}
