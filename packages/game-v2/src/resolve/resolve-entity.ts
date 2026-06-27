import { equipmentEffects } from "@workspace/game-v2/items/equipment-effects"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  getActiveMechanics,
  type ActiveMechanic,
} from "@workspace/game-v2/mechanics/active-mechanic"
import {
  collectSkills,
  skillEffects,
} from "@workspace/game-v2/resolve/collect-skills"
import {
  applyForm,
  createResolve,
  type ResolveContext,
} from "@workspace/game-v2/resolve/resolve"
import { hydrateSkills } from "@workspace/game-v2/skills/resolved"

/**
 * The pre-resolve form transform (D38, layer 2): merge the active form-swap
 * mechanic's form bag onto the entity via `applyForm`, or return the entity
 * unchanged (same ref) when no form is active. Pure and decoupled from the
 * registry — it takes an already-resolved {@link ActiveMechanic} — so the
 * form-swap seam is testable with a fixture form-swap mechanic before any real one
 * is registered.
 */
export function applyActiveForm(
  active: ActiveMechanic | null,
  entity: Entity
): Entity {
  const form = active?.definition.activeForm?.(active.state) ?? null
  return form ? applyForm(entity, form) : entity
}

/**
 * The **mechanic-aware resolve** — the app-facing entry point that layers an entity's
 * active mechanic(s), skills, and equipment onto the pure {@link createResolve} stat
 * fold. It runs the resolve pipeline's three phases (UNN-512 audit):
 *
 * 1. **Collect** — {@link collectSkills} unions every Skill the entity can field
 *    (intrinsic + active archetype kit + inheritance + equipment grants), deduped, with
 *    each source routed for its form semantics. This one set is the single source of
 *    truth for phases 2 and 3 (v1's `activeSkillsFor` `Set`).
 * 2. **Resolve** — the stat fold, with the delta pool fed every effect contributor in
 *    C6 order: active mechanic → skill effects (every collected Skill's always-on
 *    `effects[]`) → equipment stat bonuses → context (zone enchantment, etc.). `resolve`
 *    folds attribute/affinity in and surfaces attack-roll/damage as `pendingEffects`;
 *    the combat resolver preserves the order in `sources[]` (a display contract).
 * 3. **Hydrate** — {@link hydrateSkills} resolves the collected Skills against the now
 *    **finished** entity (cost vs maxHP, Attack Roll vs final attributes), attached as
 *    the `skills` read-unit. Emitted only when the entity fields ≥1 Skill.
 *
 * The active form (D38, layer 2): each form-swap mechanic's form bag is merged via
 * `applyForm` **before** `resolve` — a pre-resolve `Entity → Entity` transform, so
 * `resolve` keeps no form branch. Mechanics are read from the **original** entity (a
 * PC's active Archetype is still attached); `applyForm` then detaches it, and the
 * collection reads `formed` (kit/equipment/intrinsic) vs `entity` (inheritance)
 * accordingly. Keeping this orchestration in the `resolve/` composition tier (over the
 * pure base fold) keeps the dependency one-way — `resolve → mechanics → progression`.
 */
export function createResolveEntity(
  deps: Pick<GameData, "getArchetype" | "getEquippableItem" | "getSkill">
) {
  const resolve = createResolve(deps)

  return function resolveEntity(
    entity: Entity,
    context: ResolveContext = {}
  ): ResolvedEntity {
    const active = getActiveMechanics(deps, entity)

    const formed = active.reduce(
      (current, mechanic) => applyActiveForm(mechanic, current),
      entity
    )

    // Phase 1 — collect once; phases 2 and 3 both read this set.
    const skills = collectSkills(deps, formed, entity)

    const mechanicEffects = active.flatMap(
      (mechanic) => mechanic.definition.effects?.(mechanic.state) ?? []
    )
    // C6 contributor order — the skill-effects slot MUST stay between mechanic and
    // context (appending it to `context.effects` would invert C6). Equipment's direct
    // affinity/attribute bonuses carry no Attack-Roll effects, so their position is
    // immaterial to the `sources[]` order; they sit with the skill region.
    const effects = [
      ...mechanicEffects,
      ...skillEffects(skills),
      ...equipmentEffects(deps, formed),
      ...(context.effects ?? []),
    ]

    // Phase 2 — the stat fold over the finished effect pool. Forward the whole
    // context (only `effects` is overridden with the assembled pool), so any other
    // context field reaches `resolve` without per-field threading here.
    const resolved = resolve(formed, { ...context, effects })

    // Phase 3 — hydrate the collected Skills against the finished entity. Omit the
    // read-unit entirely when the entity fields none (no empty array on the bag).
    if (skills.length === 0) return resolved

    return {
      ...resolved,
      components: {
        ...resolved.components,
        skills: hydrateSkills(skills, resolved, context),
      },
    }
  }
}
