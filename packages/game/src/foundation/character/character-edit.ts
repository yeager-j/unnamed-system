import type {
  BattleConditionAxisKey,
  BattleConditionState,
  VirtueKey,
} from "@workspace/game/foundation/character/state"
import type { TalentKey } from "@workspace/game/foundation/character/talents/schema"
import { type InventoryMutation } from "@workspace/game/foundation/items/schema"
import { type StainElement } from "@workspace/game/foundation/mechanics/schema"

export type BattleConditionFlagKey = "charged" | "concentrating"

/**
 * Inventory + currency slice: item-row mutations and the gold-piece wallet.
 * Grouped because the wallet renders on the Inventory tab and rides the same
 * optimistic frame as the item rows (UNN-223).
 */
export type InventoryEdit =
  | { kind: "inventory"; mutation: InventoryMutation }
  | { kind: "currency"; delta: number }

/** Combat-state slice: Ailments, the three Battle Condition axes, the two
 *  Battle Condition flags, Exhaustion stepping, and the encounter wipe. */
export type CombatStateEdit =
  | { kind: "ailments"; ailments: string[] }
  | {
      kind: "battleConditionAxis"
      axis: BattleConditionAxisKey
      state: BattleConditionState
    }
  | {
      kind: "battleConditionFlag"
      flag: BattleConditionFlagKey
      value: boolean
    }
  | { kind: "exhaustion"; direction: "increment" | "decrement" }
  | { kind: "clearCombatState" }

/** Pools / casting slice: the manual HP/SP/Prisma affordances plus Skill casts. */
export type PoolsEdit =
  | { kind: "usePrisma" }
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "spendSP"; amount: number }
  | { kind: "recoverSP"; amount: number }
  | { kind: "cast"; skillKey: string }

/** Mechanics slice: stepping the active Archetype's unique mechanic (Valor,
 *  Perfection, Stains, Path of Dawn). */
export type MechanicEdit =
  | { kind: "valor"; direction: "increment" | "decrement" }
  | { kind: "perfection"; op: "increment" | "decrement" | "reset" }
  | {
      kind: "stains"
      op: "setSlot"
      slotIndex: number
      element: StainElement | null
    }
  | { kind: "stains"; op: "clear" }
  | { kind: "pathOfDawn"; dawnMode: boolean }
  | { kind: "pathOfDusk"; duskMode: boolean }

/** Progression slice: banking Victories and the Spark log. */
export type ProgressionEdit =
  | { kind: "victories"; delta: number }
  | { kind: "addSpark"; virtue: VirtueKey }
  | { kind: "rankUpVirtue"; virtue: VirtueKey }

/** Talents slice: adding or removing a gained Talent key. */
export type TalentEdit =
  | { kind: "talentAdd"; talentKey: TalentKey }
  | { kind: "talentRemove"; talentKey: TalentKey }

/** Archetypes slice: switching the active Archetype and configuring an
 *  Inheritance Slot. */
export type ArchetypeEdit =
  | { kind: "switchActiveArchetype"; characterArchetypeId: string }
  | {
      kind: "setInheritanceSlot"
      characterArchetypeId: string
      slotIndex: number
      sourceCharacterArchetypeId: string | null
      skillKey: string | null
    }
  | { kind: "unlockArchetype"; archetypeKey: string }
  | { kind: "rankUpArchetype"; characterArchetypeId: string }

/**
 * One owner-mode edit to a character, in raw-input terms. Each variant maps to
 * a pure transition the server already runs; {@link reduceCharacter} applies it
 * and re-derives the whole sheet view, so an optimistic frame matches what the
 * server will produce — including cross-field consequences a slice-local patch
 * would miss.
 *
 * The union is the sum of the per-domain sub-unions above — each owned by the
 * matching slice in `./reduce/` — so the edit vocabulary and the slice that
 * handles it stay in lockstep. This is a type-only leaf module: a slice imports
 * its sub-union without importing the orchestrator that imports the slice back.
 */
export type CharacterEdit =
  | InventoryEdit
  | CombatStateEdit
  | PoolsEdit
  | MechanicEdit
  | ProgressionEdit
  | TalentEdit
  | ArchetypeEdit
