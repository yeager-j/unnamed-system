import {
  type Talent,
  type TalentKey,
} from "@workspace/game/foundation/character/talents/schema"

/**
 * A minimal {@link Talent} for tests that resolve Talent display labels. `key`
 * must be a real {@link TalentKey} (the schema enumerates them), but it is used
 * as an **opaque id**: tests assign the Talent's `name` here and assert the
 * alpha-by-name ordering against that, never against the shipped label — so a
 * rename in the real catalog can't break a logic test.
 */
export function makeTalent(key: TalentKey, name: string): Talent {
  return { key, name }
}
