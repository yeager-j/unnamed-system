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

/**
 * A `Map`, like every other catalog index (`ARCHETYPES_BY_KEY`, `SKILLS_BY_KEY`,
 * `ITEMS_BY_KEY`) — not a plain object. A Talent key is an open string off a jsonb
 * column, so an object index answers `getTalent("constructor")` with
 * `Object.prototype.constructor` and `getTalent("__proto__")` with
 * `Object.prototype`. A `Map` has no prototype chain to walk into, and the lookup
 * needs no cast to widen its key.
 */
const TALENTS_BY_KEY = new Map<string, Talent>(
  TALENT_KEYS.map((key) => [key, { key, name: TALENT_NAMES[key] }])
)

/** Every canonical Talent, in {@link TALENT_KEYS} order. */
export const TALENTS: readonly Talent[] = [...TALENTS_BY_KEY.values()]

/**
 * Looks up a canonical Talent by its slug key. Returns `undefined` when no Talent
 * matches.
 */
export function getTalent(key: string): Talent | undefined {
  return TALENTS_BY_KEY.get(key)
}
