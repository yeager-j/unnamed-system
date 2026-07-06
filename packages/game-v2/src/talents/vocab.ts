/**
 * The canonical Talent list (rulebook 2.1 Talent Tests), re-declared in v2 (D32) —
 * a Talent is an area of training that grants +3 to a Talent Test. An Archetype's
 * `talents` and a character's learned Talents reference these by key. Zod-free
 * constants, mirroring {@link import("@workspace/game-v2/encounter/vocab").AILMENT_KEYS};
 * the display {@link import("./catalog") catalog} builds its name record over this array.
 */
export const TALENT_KEYS = [
  "alchemy",
  "cook",
  "enchant",
  "craft",
  "climb",
  "swim",
  "lift",
  "athletics",
  "medicine",
  "handle-animal",
  "persuade",
  "lie",
  "intimidate",
  "flirt",
  "perform",
  "interrogate",
  "sneak",
  "lockpick",
  "demolish",
  "sleight-of-hand",
  "track",
  "sense",
  "investigate",
  "culture",
  "history",
  "arcana",
  "nature",
  "monsters",
] as const

export type TalentKey = (typeof TALENT_KEYS)[number]

/**
 * Max player-added Talents at character creation (rulebook 2.1 / PRD §5.2). The
 * active-Archetype Talents that resolve at read time are *additive* on top of this
 * cap — the limit applies only to entries the player explicitly picked.
 */
export const MAX_PLAYER_ADDED_TALENTS = 2
