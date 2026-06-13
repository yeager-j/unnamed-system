import {
  deriveHydratedCharacter,
  toRawInputs,
  type CharacterLookups,
  type RawCharacterInputs,
} from "@workspace/game/engine/character/derive-hydrated-character"
import { reduceArchetypeEdit } from "@workspace/game/engine/character/reduce/archetypes"
import { reduceCombatStateEdit } from "@workspace/game/engine/character/reduce/combat-state"
import { reduceInventoryEdit } from "@workspace/game/engine/character/reduce/inventory"
import { reduceMechanicEdit } from "@workspace/game/engine/character/reduce/mechanics"
import { reducePoolsEdit } from "@workspace/game/engine/character/reduce/pools"
import { reduceProgressionEdit } from "@workspace/game/engine/character/reduce/progression"
import type { SliceResult } from "@workspace/game/engine/character/reduce/shared"
import { reduceTalentEdit } from "@workspace/game/engine/character/reduce/talents"
import { type GameData } from "@workspace/game/engine/ports"
import type { CharacterEdit } from "@workspace/game/foundation/character/character-edit"
import type { HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"

/**
 * Applies a {@link CharacterEdit} to a {@link HydratedCharacter} by projecting
 * back to {@link RawCharacterInputs}, routing to the matching per-domain slice
 * (in `./reduce/`), and re-deriving with {@link deriveHydratedCharacter} — the
 * same function the server loader uses. `newId` mints ids for inventory rows an
 * `add` creates (the server's revalidate later replaces them with persisted
 * rows); it is bound at the composition root ({@link createGameEngine}) so the
 * engine core stays seam-free and tests inject a deterministic generator. A
 * slice returns `null` when the edit is a no-op or the underlying engine rejects
 * it; this is the one place that maps that to "leave the character unchanged".
 */
export function reduceCharacter(
  lookups: CharacterLookups & Pick<GameData, "allArchetypes">,
  newId: () => string
) {
  return (
    character: HydratedCharacter,
    edit: CharacterEdit
  ): HydratedCharacter => {
    const raw = toRawInputs(character)
    const next = routeEdit(raw, character, edit, lookups, newId)
    return next ? deriveHydratedCharacter(lookups)(next) : character
  }
}

/**
 * Dispatches an edit to its domain slice. The grouped `switch` is exhaustive
 * over every {@link CharacterEdit} kind — each fall-through group narrows `edit`
 * to exactly the slice's `Extract`'d sub-union — so adding a new kind is a
 * compile error until it is both handled in a slice and routed here.
 */
function routeEdit(
  raw: RawCharacterInputs,
  character: HydratedCharacter,
  edit: CharacterEdit,
  lookups: Pick<GameData, "getItem" | "getEquippableItem" | "allArchetypes">,
  newId: () => string
): SliceResult {
  switch (edit.kind) {
    case "inventory":
    case "currency":
      return reduceInventoryEdit(raw, edit, newId, lookups)

    case "ailments":
    case "battleConditionAxis":
    case "battleConditionFlag":
    case "exhaustion":
    case "clearCombatState":
      return reduceCombatStateEdit(raw, edit)

    case "usePrisma":
    case "damage":
    case "heal":
    case "spendSP":
    case "recoverSP":
    case "cast":
      return reducePoolsEdit(raw, character, edit)

    case "valor":
    case "perfection":
    case "stains":
    case "pathOfDawn":
    case "pathOfDusk":
    case "frenzyPain":
    case "frenzyMode":
      return reduceMechanicEdit(raw, edit)

    case "victories":
    case "addSpark":
    case "rankUpVirtue":
      return reduceProgressionEdit(raw, edit)

    case "talentAdd":
    case "talentRemove":
      return reduceTalentEdit(raw, edit)

    case "switchActiveArchetype":
    case "setInheritanceSlot":
    case "unlockArchetype":
    case "rankUpArchetype":
      return reduceArchetypeEdit(raw, edit, newId, lookups.allArchetypes())
  }
}
