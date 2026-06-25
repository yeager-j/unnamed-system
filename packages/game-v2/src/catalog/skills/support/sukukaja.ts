import type { Skill } from "@workspace/game-v2/skills/skill.schema"

export const sukukaja = {
  kind: "support",
  key: "sukukaja",
  name: "Sukukaja",
  tagline: "Increases 1 ally's Hit/Evasion for 3 turns.",
  description: "Increases 1 ally's **Hit/Evasion** for 3 turns.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 8 },
  range: { kind: "known", value: "same-or-adjacent-zone" },
  duration: 3,
  enchantment: "tarantella",
  effect:
    "**(Bard Only)** *Tarantella Enchantment*\n\n**`Forte 1`** All combatants who start their turn in this Zone gain an additional Reaction.\n\n**`Forte 2`** All combatants who start their turn in this Zone gain an additional Move Action.\n\n**`Forte 3`** All Engaged combatants who start their turn in this Zone gain an additional Standard Action.",
} satisfies Skill
