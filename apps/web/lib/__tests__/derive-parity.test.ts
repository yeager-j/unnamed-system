import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data"
import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "@workspace/game/engine"
import { makeRawCharacterInputs } from "@workspace/game/engine/__fixtures__/character"
import type { CombatContext } from "@workspace/game/foundation/character/state"

import { deriveHydratedCharacterV2 } from "@/lib/game-engine-v2"

import {
  archetypeId,
  SEED_CHARACTERS,
  type SeedCharacter,
} from "../__fixtures__/seed-characters"

/**
 * **Full-projection parity over the real seed roster (UNN-533, PR11a).** The
 * surface-level analogue of the fixture-backed golden master: build every seed
 * character's {@link RawCharacterInputs} (the same assembly `lib/db/seed-character.ts`
 * persists), derive with v1's `deriveHydratedCharacter` (real catalogs, the oracle)
 * and the v2-backed `deriveHydratedCharacterV2`, and assert the **entire**
 * `HydratedCharacter` deep-equals — passthrough and all 13 derived fields, down to
 * each skill's resolved cost/Attack Roll/damage-bonus labels. This is the CI gate
 * behind the cutover flip in `lib/game-engine.ts`; any drifting leaf shows up by
 * JSON path in the vitest diff.
 *
 * The combat-context variant threads the tracker's inputs (party composition +
 * zone effects) through both engines, so the encounter-aware derive path — the
 * `perPartyLineage` scaler and the zone-effect fold — is gated too.
 */

const v1Derive = deriveHydratedCharacter(gameData)

function seedToRawInputs(seed: SeedCharacter): RawCharacterInputs {
  const characterId = `seed-char-${seed.slug}`
  return makeRawCharacterInputs({
    row: {
      id: characterId,
      shortId: seed.shortId,
      name: seed.name,
      pronouns: seed.pronouns,
      level: seed.level,
      pathChoice: seed.pathChoice,
      manualBonuses: seed.manualBonuses,
      gainedTalents: seed.gainedTalents,
      activeArchetypeId: archetypeId(seed.slug, seed.activeArchetypeKey),
      originCharacterArchetypeId: archetypeId(
        seed.slug,
        seed.originArchetypeKey ?? seed.activeArchetypeKey
      ),
      savedArchetypeRanks: seed.savedArchetypeRanks ?? 0,
    },
    archetypeRows: seed.archetypes.map((archetype) => ({
      id: archetypeId(seed.slug, archetype.archetypeKey),
      characterId,
      archetypeKey: archetype.archetypeKey,
      rank: archetype.rank,
      inheritanceSlots: (archetype.inheritanceSlots ?? []).map((slot) => ({
        slotIndex: slot.slotIndex,
        sourceCharacterArchetypeId: archetypeId(
          seed.slug,
          slot.sourceArchetypeKey
        ),
        skillKey: slot.skillKey,
      })),
      mechanicState: archetype.mechanicState ?? null,
    })),
    inventoryRows: seed.items.map((item, index) => ({
      id: `seed-item-${seed.slug}-${index}`,
      characterId,
      catalogItemKey: item.catalogItemKey,
      equipped: item.equipped,
      quantity: item.quantity ?? 1,
    })),
  })
}

/** The tracker's encounter-scoped inputs, exercised over every seed: a mixed
 *  party (drives `perPartyLineage` scalers like Magic Circle / Ailment Boost)
 *  plus zone effects of every foldable type. */
const COMBAT_CONTEXT: CombatContext = {
  partyComposition: { warrior: 2, mage: 1, knight: 1, healer: 1 },
  zoneEffects: [
    { type: "attribute", target: "magic", amount: 3 },
    { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
    {
      type: "attackRoll",
      amount: 2,
      source: "Zone Enchantment",
      when: { deliveries: ["magical"] },
    },
    {
      type: "damage",
      dice: { count: 1, sides: 4 },
      source: "Zone Enchantment",
      when: { deliveries: ["magical"] },
    },
  ],
}

describe("v1 ↔ v2 full-sheet derivation parity (seed roster, real catalogs)", () => {
  for (const seed of SEED_CHARACTERS) {
    it(`derives ${seed.slug} (L${seed.level}) identically`, () => {
      const raw = seedToRawInputs(seed)
      expect(deriveHydratedCharacterV2(raw)).toEqual(v1Derive(raw))
    })

    it(`derives ${seed.slug} identically under a combat context`, () => {
      const raw = seedToRawInputs(seed)
      expect(deriveHydratedCharacterV2(raw, COMBAT_CONTEXT)).toEqual(
        v1Derive(raw, COMBAT_CONTEXT)
      )
    })
  }
})
