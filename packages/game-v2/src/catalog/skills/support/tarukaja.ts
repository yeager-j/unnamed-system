import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const tarukaja = {
  kind: "support",
  key: "tarukaja",
  name: "Tarukaja",
  tagline: "Increases 1 ally's Attack power for 3 turns.",
  description: "Increases 1 ally's **Attack** power for 3 turns.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 8 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  duration: 3,
  enchantment: "toccata",
  effect:
    "**(Bard Only)** *Toccata Enchantment*\n\n**`Forte 1`** Attack Rolls made by combatants in the Zone gain a bonus equal to the Zone's Forte.\n\n**`Forte 2`** Side-Effect Luck checks made by combatants in the Zone win ties instead of losing them.\n\n**`Forte 3`** Natural 19s rolled in the Zone count as natural 20s.",
} satisfies Skill
