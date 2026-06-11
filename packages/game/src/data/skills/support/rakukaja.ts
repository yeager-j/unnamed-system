import type { Skill } from "@workspace/game/foundation/skills/schema"

export const rakukaja = {
  kind: "support",
  key: "rakukaja",
  name: "Rakukaja",
  tagline: "Increases 1 ally's Defense for 3 turns.",
  description: "Increases 1 ally's **Defense** for 3 turns.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 8 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  duration: 3,
  enchantment: "requiem",
  effect:
    "**(Bard Only)** *Requiem Enchantment*\n\n**`Forte 1`** All damage is reduced by a flat amount equal to the Zone's Forte.\n\n**`Forte 2`** Combatants are not Downed via a Technical.\n\n**`Forte 3`** Combatants are not Downed via their Weakness.",
} satisfies Skill
