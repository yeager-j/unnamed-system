import { z } from "zod/v4"

/**
 * The canonical Talent list (rulebook 2.1 Talent Tests). A Talent is an area
 * of training that grants +3 to a Talent Test. An Archetype's `talents` and a
 * character's learned Talents reference these by key. `key` is a slug; `name`
 * is the display label.
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
 * Max player-added Talents at character creation, per PRD §5.2. The hardcoded
 * archetype Talents that resolve at hydration are *additive* on top of this
 * cap — the limit applies only to entries the player explicitly picked.
 */
export const MAX_PLAYER_ADDED_TALENTS = 2

export const talentSchema = z.object({
  key: z.enum(TALENT_KEYS),
  name: z.string().min(1),
})

export type Talent = z.infer<typeof talentSchema>

const TALENT_NAMES: Record<TalentKey, string> = {
  alchemy: "Alchemy",
  cook: "Cook",
  enchant: "Enchant",
  craft: "Craft",
  climb: "Climb",
  swim: "Swim",
  lift: "Lift",
  athletics: "Athletics",
  medicine: "Medicine",
  "handle-animal": "Handle Animal",
  persuade: "Persuade",
  lie: "Lie",
  intimidate: "Intimidate",
  flirt: "Flirt",
  perform: "Perform",
  interrogate: "Interrogate",
  sneak: "Sneak",
  lockpick: "Lockpick",
  demolish: "Demolish",
  "sleight-of-hand": "Sleight of Hand",
  track: "Track",
  sense: "Sense",
  investigate: "Investigate",
  culture: "Culture",
  history: "History",
  arcana: "Arcana",
  nature: "Nature",
  monsters: "Monsters",
}

const TALENTS_BY_KEY = Object.fromEntries(
  TALENT_KEYS.map((key) => [key, { key, name: TALENT_NAMES[key] }])
) as Record<TalentKey, Talent>

export const TALENTS: readonly Talent[] = Object.values(TALENTS_BY_KEY)

/**
 * Looks up a canonical Talent by its slug key. Returns `undefined` when no
 * Talent matches.
 */
export function getTalent(key: string): Talent | undefined {
  return (TALENTS_BY_KEY as Record<string, Talent>)[key]
}

/**
 * Zod schema for the `characters.gainedTalents` JSONB column: an array of
 * canonical Talent keys. Background- and downtime-gained Talents live here;
 * active-Archetype Talents are derived at hydration, not persisted. The
 * `resolveTalents` helper that performs that derivation lives in `./utils`
 * — imported directly to avoid a circular load with `../archetypes`.
 */
export const gainedTalentsSchema = z.array(z.enum(TALENT_KEYS))
