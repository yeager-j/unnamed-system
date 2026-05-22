import type { EquippableItem, IntrinsicAttack } from "./items/schema"
import type { Skill } from "./skills/schema"

/**
 * Shared, test-only game-data fixtures. These deliberately model items no sane
 * designer would ship in the real catalog (pure-downside gear, single-purpose
 * stat sticks) so the derived-value logic can be exercised at its edges
 * without polluting `items/index.ts` — nothing here is ever imported by app or
 * catalog code, and these keys never reach the loader's integrity checks.
 *
 * Holds equippable-item and Skill fixtures today; intended to grow Archetype
 * fixtures as the Mechanics Engine tickets that need them land. Split into a
 * folder if/when that volume warrants it.
 */

/**
 * A throwaway weapon Attack Roll so weapon fixtures satisfy the schema without
 * the intrinsic attack distracting from the effect under test.
 */
const STUB_INTRINSIC_ATTACK: IntrinsicAttack = {
  range: { kind: "known", value: "engaged" },
  damageType: "slash",
  delivery: "physical",
  attackRoll: {
    attribute: "st",
    tiers: [{ band: "1+", formula: "1 + St", sideEffects: [] }],
  },
}

/** Armor whose only effect is a Fire weakness — strictly a downside. */
export const weaknessArmor = {
  slot: "armor",
  key: "fixture-weakness-armor",
  name: "Fixture Weakness Armor",
  description: "Test-only: imposes a Fire weakness.",
  effects: [{ type: "affinity", damageTypes: ["fire"], affinity: "weak" }],
} satisfies EquippableItem

/** Weapon that Nulls Ice. */
export const nullWeapon = {
  slot: "weapon",
  key: "fixture-null-weapon",
  name: "Fixture Null Weapon",
  description: "Test-only: Nulls Ice.",
  intrinsicAttack: STUB_INTRINSIC_ATTACK,
  effects: [{ type: "affinity", damageTypes: ["ice"], affinity: "null" }],
} satisfies EquippableItem

/** Accessory granting +2 Magic. */
export const magicAccessory = {
  slot: "accessory",
  key: "fixture-magic-accessory",
  name: "Fixture Magic Accessory",
  description: "Test-only: +2 Magic.",
  effects: [{ type: "attribute", target: "magic", amount: 2 }],
} satisfies EquippableItem

/** Accessory granting +20 SP. */
export const spAccessory = {
  slot: "accessory",
  key: "fixture-sp-accessory",
  name: "Fixture SP Accessory",
  description: "Test-only: +20 SP.",
  effects: [{ type: "attribute", target: "sp", amount: 20 }],
} satisfies EquippableItem

/**
 * Builds an accessory carrying arbitrary effects, for the one-off precise
 * combinations (specific amounts, colliding affinities) the named fixtures
 * above don't cover.
 */
export function accessoryWithEffects(
  effects: NonNullable<EquippableItem["effects"]>
): EquippableItem {
  return {
    slot: "accessory",
    key: "fixture-accessory",
    name: "Fixture Accessory",
    description: "Test-only.",
    effects,
  } satisfies EquippableItem
}

/** Passive Skill whose only effect is Nulling Elec. */
export const nullElecSkill = {
  kind: "passive",
  key: "fixture-null-elec",
  name: "Fixture Null Elec",
  tagline: "Test-only: Nulls Elec.",
  description: "Test-only: Nulls Elec.",
  isSynthesis: false,
  effects: [{ type: "affinity", damageTypes: ["elec"], affinity: "null" }],
} satisfies Skill

/** Passive Skill granting +30 SP and +2 Magic. */
export const reservesSkill = {
  kind: "passive",
  key: "fixture-reserves",
  name: "Fixture Reserves",
  tagline: "Test-only: +30 SP and +2 Magic.",
  description: "Test-only: +30 SP and +2 Magic.",
  isSynthesis: false,
  effects: [
    { type: "attribute", target: "sp", amount: 30 },
    { type: "attribute", target: "magic", amount: 2 },
  ],
} satisfies Skill
