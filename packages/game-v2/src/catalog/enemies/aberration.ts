import { defineEnemy } from "@workspace/game-v2/catalog/enemies/define-enemy"
import type { Entity } from "@workspace/game-v2/kernel/entity"

export const intellectDevourer = defineEnemy({
  key: "intellect-devourer",
  level: 4,
  name: "Intellect Devourer",
  maxHP: 28,
  attributes: { strength: -2, magic: 2, agility: 1, luck: 0 },
  affinities: { soul: "weak", mind: "drain", light: "weak" },
  skillKeys: ["psi"],
  inlineSkills: [
    {
      kind: "passive",
      key: "intellect-devourer-devour-intellect",
      name: "Devour Intellect",
      tagline: "A 20+ Mind-damage hit Downs the target.",
      description:
        "If a target takes Mind damage dealt by this creature's Skills, they are Downed if the Attack Roll was 20+.",
      isSynthesis: false,
    },
    {
      kind: "passive",
      key: "intellect-devourer-body-thief",
      name: "Body Thief",
      tagline: "Seizes a Downed creature's body, Brainwashing it.",
      description:
        "The Intellect Devourer psychically seizes control of their body.",
      isSynthesis: false,
      effect:
        "Range: **Same Zone**. Only usable against a Downed creature. The target gains the **Brainwash** Ailment until this Intellect Devourer dies.",
    },
    {
      kind: "passive",
      key: "intellect-devourer-detect-sentience",
      name: "Detect Sentience",
      tagline: "Senses any creature with Virtue ranks within 10 Zones.",
      description:
        "The Intellect Devourer can sense the presence and location of any creature within 10 Zones of it if the creature has any Virtue ranks.",
      isSynthesis: false,
    },
  ],
  talents: ["sneak"],
})

export const ABERRATION_ENEMIES = {
  "intellect-devourer": intellectDevourer,
} as const satisfies Record<string, Entity>
