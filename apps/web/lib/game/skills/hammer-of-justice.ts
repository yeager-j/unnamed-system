import type { Skill } from "./schema"

/**
 * Source-data discrepancy: the vault frontmatter tags this `type: Slash` and
 * the card body prints "8d10 Slash (Physical)", but the prose describes Pierce
 * damage and the product owner confirmed **Pierce** is correct. The vault
 * frontmatter/body are wrong; pending a source fix (UNN-38 follow-up).
 */
export const hammerOfJustice = {
  kind: "attack",
  key: "hammer-of-justice",
  name: "Hammer of Justice",
  description:
    "Deals heavy Pierce damage to all Engaged enemies. If an enemy took damage, their affinity to Pierce changes to Weak for once instance of Pierce damage.",
  archetypeKey: "knight",
  isSynthesis: true,
  cost: { kind: "sp", amount: 18 },
  range: { kind: "known", value: "all-engaged" },
  damageType: "pierce",
  delivery: "physical",
  damage: "8d10",
  effect:
    "(Knight Only) You can spend 7 Valor to make the affinity change permanent.",
} satisfies Skill
