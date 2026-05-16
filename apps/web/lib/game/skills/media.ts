import type { Skill } from "./schema"

/**
 * Source-data discrepancy: the vault card body prints "SP: 3", but the
 * frontmatter `cost: 7 SP` is correct per the product owner. The card body
 * is wrong; pending a source fix (UNN-38 follow-up).
 */
export const media = {
  kind: "heal",
  key: "media",
  name: "Media",
  description: "Weak HP recovery for all allies in a Zone.",
  archetypeKey: "healer",
  isSynthesis: false,
  cost: { kind: "sp", amount: 7 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  damage: "2d8 + Ma",
  targets: "All Allies",
} satisfies Skill
