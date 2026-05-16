import type { Skill } from "./schema"

/**
 * Source-data discrepancy: the vault frontmatter tags `range: All`, but the
 * card body's "Same/Adjacent Zone" is correct per the product owner. The
 * frontmatter is wrong; pending a source fix (UNN-38 follow-up).
 */
export const divineJudgment = {
  kind: "attack",
  key: "divine-judgment",
  name: "Divine Judgment",
  description: "Deals severe Light damage to all enemies and applies Lumina.",
  archetypeKey: "healer",
  isSynthesis: true,
  cost: { kind: "sp", amount: 20 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damageType: "light",
  delivery: "magical",
  damage: "10d8",
  targets: "All Enemies",
  effect:
    "Each enemy that takes this damage gains Lumina equal to your Luck. The next Healing or Support Skill you use before combat ends costs 0 SP.",
} satisfies Skill
