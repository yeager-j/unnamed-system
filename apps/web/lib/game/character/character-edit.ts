import type { InventoryMutation } from "../items"
import type { StainElement } from "../mechanics"
import type { BattleConditionState, VirtueKey } from "./state"
import type { TalentKey } from "./talents/registry"

export type BattleConditionAxisKey = "attack" | "defense" | "hitEvasion"
export type BattleConditionFlagKey = "charged" | "concentrating"

/**
 * One owner-mode edit to a character, in raw-input terms. Each variant maps to
 * a pure transition the server already runs; {@link reduceCharacter} applies it
 * and re-derives the whole sheet view, so an optimistic frame matches what the
 * server will produce — including cross-field consequences a slice-local patch
 * would miss.
 *
 * The union is grouped by domain to mirror the per-domain slices in
 * `./reduce/`: each slice owns an {@link Extract}'d sub-union of these kinds and
 * the orchestrator routes to it. This is a type-only leaf module so slices can
 * import their sub-union without importing the orchestrator that imports them
 * back.
 */
export type CharacterEdit =
  | { kind: "inventory"; mutation: InventoryMutation }
  | { kind: "currency"; delta: number }
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
  | { kind: "usePrisma" }
  | { kind: "clearCombatState" }
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
  | { kind: "victories"; delta: number }
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "spendSP"; amount: number }
  | { kind: "recoverSP"; amount: number }
  | { kind: "cast"; skillKey: string }
  | { kind: "addSpark"; virtue: VirtueKey }
  | { kind: "rankUpVirtue"; virtue: VirtueKey }
  | { kind: "talentAdd"; talentKey: TalentKey }
  | { kind: "talentRemove"; talentKey: TalentKey }
  | { kind: "switchActiveArchetype"; characterArchetypeId: string }
  | {
      kind: "setInheritanceSlot"
      characterArchetypeId: string
      slotIndex: number
      sourceCharacterArchetypeId: string | null
      skillKey: string | null
    }
