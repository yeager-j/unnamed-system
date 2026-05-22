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

export const talentSchema = z.object({
  key: z.enum(TALENT_KEYS),
  name: z.string().min(1),
})

export type Talent = z.infer<typeof talentSchema>

function validate(talent: Talent): Talent {
  talentSchema.parse(talent)
  return talent
}

const TALENTS_BY_KEY = {
  alchemy: validate({ key: "alchemy", name: "Alchemy" }),
  cook: validate({ key: "cook", name: "Cook" }),
  enchant: validate({ key: "enchant", name: "Enchant" }),
  craft: validate({ key: "craft", name: "Craft" }),
  climb: validate({ key: "climb", name: "Climb" }),
  swim: validate({ key: "swim", name: "Swim" }),
  lift: validate({ key: "lift", name: "Lift" }),
  athletics: validate({ key: "athletics", name: "Athletics" }),
  medicine: validate({ key: "medicine", name: "Medicine" }),
  "handle-animal": validate({ key: "handle-animal", name: "Handle Animal" }),
  persuade: validate({ key: "persuade", name: "Persuade" }),
  lie: validate({ key: "lie", name: "Lie" }),
  intimidate: validate({ key: "intimidate", name: "Intimidate" }),
  flirt: validate({ key: "flirt", name: "Flirt" }),
  perform: validate({ key: "perform", name: "Perform" }),
  interrogate: validate({ key: "interrogate", name: "Interrogate" }),
  sneak: validate({ key: "sneak", name: "Sneak" }),
  lockpick: validate({ key: "lockpick", name: "Lockpick" }),
  demolish: validate({ key: "demolish", name: "Demolish" }),
  "sleight-of-hand": validate({
    key: "sleight-of-hand",
    name: "Sleight of Hand",
  }),
  track: validate({ key: "track", name: "Track" }),
  sense: validate({ key: "sense", name: "Sense" }),
  investigate: validate({ key: "investigate", name: "Investigate" }),
  culture: validate({ key: "culture", name: "Culture" }),
  history: validate({ key: "history", name: "History" }),
  arcana: validate({ key: "arcana", name: "Arcana" }),
  nature: validate({ key: "nature", name: "Nature" }),
  monsters: validate({ key: "monsters", name: "Monsters" }),
} as const satisfies Record<TalentKey, Talent>

export const TALENTS: readonly Talent[] = Object.values(TALENTS_BY_KEY)

/**
 * Looks up a canonical Talent by its slug key. Returns `undefined` when no
 * Talent matches.
 */
export function getTalent(key: string): Talent | undefined {
  return (TALENTS_BY_KEY as Record<string, Talent>)[key]
}
