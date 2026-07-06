import { TALENT_KEYS, type TalentKey } from "@workspace/game-v2/talents/vocab"

/**
 * A canonical Talent with its display fields — the engine-owned reference content
 * homed in the game package (CH10, reversing the earlier app-map routing). Talents
 * are a closed rulebook union with no per-Talent mechanics today, so — like
 * {@link import("@workspace/game-v2/combat/side-effects") the side-effect catalog} —
 * this lives in its own domain rather than behind the injectable `GameData` port.
 * Verbatim from v1 `data/character/talents/registry.ts`: `key` is a slug, `name`
 * the display label.
 */
export interface Talent {
  key: TalentKey
  name: string
}

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

/** Every canonical Talent, in {@link TALENT_KEYS} order. */
export const TALENTS: readonly Talent[] = Object.values(TALENTS_BY_KEY)

/**
 * Looks up a canonical Talent by its slug key. Returns `undefined` when no Talent
 * matches.
 */
export function getTalent(key: string): Talent | undefined {
  return (TALENTS_BY_KEY as Record<string, Talent>)[key]
}
