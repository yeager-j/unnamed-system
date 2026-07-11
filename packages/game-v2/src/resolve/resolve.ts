import {
  affinityEffectChart,
  computeAffinityChart,
} from "@workspace/game-v2/affinities/derive"
import { masteryBonuses } from "@workspace/game-v2/archetypes/mastery"
import { resolveArchetypes } from "@workspace/game-v2/archetypes/resolved"
import {
  attributeEffectBonuses,
  computeAttributes,
} from "@workspace/game-v2/attributes/derive"
import type { PartyComposition } from "@workspace/game-v2/combat/party"
import {
  sumBonuses,
  type BonusPool,
} from "@workspace/game-v2/kernel/bonus-pool"
import {
  type AttackRollEffect,
  type CombatantEffect,
  type DamageEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { manualBonusPool } from "@workspace/game-v2/progression/manual-bonuses"
import {
  computeMaxHitDice,
  computeMaxSkillDice,
  PRISMA_BASE_CHARGES,
} from "@workspace/game-v2/resources/derive"
import { getExhaustionLevel } from "@workspace/game-v2/resources/exhaustion-table"
import { computeMaxHP, computeMaxSP } from "@workspace/game-v2/vitals/derive"

/**
 * Off-entity inputs to a resolve (encounter-scoped). Defaults are inert, so an
 * off-encounter resolve is pure over the entity alone (A8/A9).
 */
export interface ResolveContext {
  /**
   * Delta effects to fold on top of the entity's intrinsic stats — the active
   * mechanic's `effects()`, a Zone Enchantment, equipment/passives (their PRs).
   * `resolve` is the agnostic fold: it partitions these by kind — attribute → the
   * bonus pool, affinity → a chart source, attack-roll/damage → the
   * `pendingEffects` read-unit (no in-fold consumer yet). Callers that need the
   * active mechanic folded in use `resolveEntity` (mechanics/), which assembles
   * this list; bare `resolve` stays pure over the entity + whatever it's handed.
   */
  effects?: readonly CombatantEffect[]
  /**
   * Optional party context for Skills whose Attack Roll effects scale by party
   * composition. Omitted/null collapses those scalers to 0. Read at the **hydrate
   * phase** by `resolveEntity` (it builds the `ScalerContext` for `hydrateSkills`);
   * the bare stat fold doesn't consume it — it travels on the shared pipeline context.
   */
  partyComposition?: PartyComposition | null
}

function isAttackRollEffect(
  effect: CombatantEffect
): effect is AttackRollEffect {
  return effect.type === "attackRoll"
}

function isDamageEffect(effect: CombatantEffect): effect is DamageEffect {
  return effect.type === "damage"
}

/**
 * The **layered `resolve`** (D8/D30/D34–D37). Deps-first curried over the catalog
 * slice it touches (`getArchetype`), then `(entity, context?) → ResolvedEntity` —
 * pure, `Entity → Entity` (authored → effective), emitting only the resolved
 * capability read-units the entity carries (D30).
 *
 * **One uniform fold for every entity (D37):** each derivable capability folds its
 * authored `base` → the layers present on the entity (`Archetypes` → archetype
 * attributes/affinities; `Level` + `Path` → the path/level HP/SP formula) → the delta
 * effects (mastery/manual/zone now; equipment/mechanic with their PRs), then derives
 * the depletion **current** against the final maxima. There is **no form concept
 * here** — a form-swap is a prior `Entity → Entity` transform
 * ({@link import("./form-swap-policy").applyForm}), so a natural entity and a
 * shapechanged one flow through this *same* path.
 */
export function createResolve(deps: Pick<GameData, "getArchetype">) {
  return function resolve(
    entity: Entity,
    context: ResolveContext = {}
  ): ResolvedEntity {
    const {
      level,
      path,
      identity,
      presentation,
      archetypes,
      manualBonuses,
      attributes,
      affinities,
      vitals,
      skillPool,
      talents,
      resources,
      exhaustion,
      virtues,
      narrative,
    } = entity.components
    const effects = context.effects ?? []

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
      attributeEffectBonuses(effects)
    )

    const components: ResolvedEntity["components"] = {}

    if (identity) {
      components.identity = identity
    }

    if (presentation) {
      // Cosmetic, no derivation — passed through verbatim so `portraitUrl` has a
      // resolved surface for redaction (visibility/) to keep public to all viewers.
      components.presentation = presentation
    }

    if (archetypes) {
      // The archetype roster, projected onto the resolved entity so the sheet (and
      // the Atlas / inheritance / display) read it off the ResolvedEntity. Carries
      // derived `activeLineage` + per-entry `mastered`; `applyForm` has already
      // nulled `active` under a form, so the read-unit reflects kit suppression.
      components.archetypes = resolveArchetypes(archetypes, deps.getArchetype)
    }

    if (attributes) {
      // base + archetype layer + delta pool, summed and clamped in one pass.
      components.attributes = computeAttributes(
        attributes.base,
        activeArchetypeBase?.attributes,
        pool
      )
    }

    if (affinities) {
      // The entity base, the active Archetype layer, and the effect-derived chart,
      // folded per type by strongest-wins — a stronger affinity from any source is
      // not downgraded by a weaker one (UNN-502). Mirrors the attributes fold above.
      components.affinities = computeAffinityChart(
        affinities.base,
        activeArchetypeBase?.affinities,
        affinityEffectChart(effects)
      )
    }

    if (vitals) {
      // Final maxHP through the layers, THEN derive currentHP from the authored,
      // form-independent `damage` (D9 continuity). Over-max (negative `damage`) floats
      // currentHP above maxHP; overkill floors it at 0 without losing stored `damage`.
      const maxHP = computeMaxHP(level, path, vitals, pool)
      components.vitals = {
        maxHP,
        currentHP: Math.max(0, maxHP - vitals.damage),
      }
    }

    if (skillPool) {
      const maxSP = computeMaxSP(level, path, skillPool, pool)
      components.skillPool = {
        maxSP,
        currentSP: Math.max(0, maxSP - skillPool.spSpent),
      }
    }

    // Dice pools — gated on the entity's own Resources component (its consumable
    // spend-state, like vitals/skillPool gate on theirs), with the maxima derived
    // from the Level. An enemy carries a Level but no Resources, so it resolves no
    // dice; a shapechanged PC keeps both, so its dice still resolve (they're its
    // own, unchanged by the form). Current = max − used.
    if (resources && level) {
      const maxHitDice = computeMaxHitDice(level.value)
      const maxSkillDice = computeMaxSkillDice(level.value)
      components.resources = {
        maxHitDice,
        currentHitDice: Math.max(0, maxHitDice - resources.hitDiceUsed),
        maxSkillDice,
        currentSkillDice: Math.max(0, maxSkillDice - resources.skillDiceUsed),
        maxPrisma: PRISMA_BASE_CHARGES,
        currentPrisma: Math.max(0, PRISMA_BASE_CHARGES - resources.prismaUsed),
      }
    }

    // Exhaustion: a durable level resolved to its table entry (D27). Effects are
    // table-derived; the rulebook 1–6 effects are unshipped, so none fold into the
    // pool yet — when they ship they enter as one more BonusPool source above.
    if (exhaustion) {
      components.exhaustion = getExhaustionLevel(exhaustion.level)
    }

    // Contextual delta effects with no in-fold consumer (D30/D40): an attack-roll
    // or damage effect resolves against a specific attack at use time, so `resolve`
    // can't fold it into a number — it carries them for the PR7 attack-roll/damage
    // resolvers. Affinity/attribute effects are NOT here (consumed above), so each
    // effect lands in exactly one place. Emitted only when non-empty.
    const attackRoll = effects.filter(isAttackRollEffect)
    const damage = effects.filter(isDamageEffect)
    if (attackRoll.length > 0 || damage.length > 0) {
      components.pendingEffects = { attackRoll, damage }
    }

    // Talents pass through verbatim (no derivation). Skills are NOT resolved here:
    // they need the *finished* entity (cost vs maxHP, Attack Roll vs final attributes)
    // and span four sources (intrinsic + archetype kit + inheritance + equipment), so
    // they are a composition-tier collect → hydrate over this stat fold's output —
    // `resolveEntity`, alongside the passive-skill effects that feed the pool above.
    if (talents) {
      components.talents = talents
    }

    // Identity/progression pass-throughs (UNN-551) — authored == effective, like
    // `talents`. The character surfaces read them off the resolved entity; the
    // visibility table drops both from every combat viewer.
    if (virtues) {
      components.virtues = virtues
    }

    if (narrative) {
      components.narrative = narrative
    }

    return { id: entity.id, components }
  }
}
