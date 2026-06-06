import {
  TALENT_KEYS,
  type Talent,
  type TalentKey,
} from "@workspace/game/foundation/character/talents/schema"

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
