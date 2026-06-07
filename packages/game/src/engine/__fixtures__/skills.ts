import {
  type AttackSkill,
  type PassiveSkill,
  type Skill,
} from "@workspace/game/foundation/skills/schema"

/**
 * Builders for minimal valid {@link Skill}s, so a logic test seeds a synthetic
 * catalog instead of importing real entries and asserting balance numbers. Every
 * `key` is used as an **opaque id** — reference a real {@link import("@workspace/game/data/skills/registry").SkillKey}
 * if a fixture Archetype needs one, but assert behavior, never the shipped
 * Skill's cost/effects.
 */

/** A passive Skill with no effects — the default "this key resolves" fixture. */
export function makePassiveSkill(overrides: Partial<PassiveSkill> = {}): Skill {
  const key = overrides.key ?? "fixture-passive"
  return {
    kind: "passive",
    key,
    name: key,
    tagline: key,
    description: key,
    isSynthesis: false,
    ...overrides,
  }
}

/**
 * An attack Skill carrying a concrete {@link import("@workspace/game/foundation/skills/schema").SkillCost}
 * (defaulting to a 5%-HP cost), so the cast flow has a payable Skill to resolve.
 * Defaults to an engaged Strike with no Attack Roll; override `cost`/`range`/etc.
 */
export function makeAttackSkill(overrides: Partial<AttackSkill> = {}): Skill {
  const key = overrides.key ?? "fixture-attack"
  return {
    kind: "attack",
    key,
    name: key,
    tagline: key,
    description: key,
    isSynthesis: false,
    cost: { kind: "hp-percent", amount: 5 },
    range: { kind: "known", value: "engaged" },
    damageType: "strike",
    delivery: "physical",
    ...overrides,
  }
}
