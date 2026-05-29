import type { CharacterRow } from "../../db/load-character"
import type { Result } from "../../result"
import { MAX_EXHAUSTION_LEVEL } from "../combat"
import {
  applyInventoryMutation,
  type InventoryItemState,
  type InventoryMutation,
} from "../items"
import {
  adjustPerfection,
  adjustValor,
  clearStains,
  initialStateFor,
  resetPerfection,
  setDawnMode,
  setStainSlot,
  type MechanicState,
  type PathOfDawnState,
  type PerfectionState,
  type StainElement,
  type StainsState,
  type ValorState,
} from "../mechanics"
import { applyResolvedCost } from "../skills"
import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
  applyUsePrisma,
} from "./adjust-pools"
import { clampCurrency } from "./currency"
import {
  deriveHydratedCharacter,
  toRawInputs,
  type RawCharacterInputs,
} from "./derive-hydrated-character"
import type { HydratedCharacter } from "./hydrated-character"
import { addSpark, rankUpVirtue, type SparkCharacter } from "./leveling"
import {
  DEFAULT_BATTLE_CONDITIONS,
  type BattleConditionState,
  type VirtueKey,
} from "./state"
import type { TalentKey } from "./talents/registry"

type BattleConditionAxisKey = "attack" | "defense" | "hitEvasion"
type BattleConditionFlagKey = "charged" | "concentrating"

/**
 * One owner-mode edit to a character, in raw-input terms. Each variant maps to
 * a pure transition the server already runs; {@link reduceCharacter} applies it
 * and re-derives the whole sheet view, so an optimistic frame matches what the
 * server will produce — including cross-field consequences a slice-local patch
 * would miss.
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

const randomId = () => crypto.randomUUID()

/**
 * Applies a {@link CharacterEdit} to a {@link HydratedCharacter} by projecting
 * back to {@link RawCharacterInputs}, running the matching pure engine
 * transition, and re-deriving with {@link deriveHydratedCharacter} — the same
 * function the server loader uses. `newId` mints ids for inventory rows an
 * `add` creates (the optimistic frame defaults to `crypto.randomUUID`; the
 * server's revalidate later replaces them with persisted rows). Returns the
 * input unchanged when the underlying engine rejects the edit.
 */
export function reduceCharacter(
  character: HydratedCharacter,
  edit: CharacterEdit,
  newId: () => string = randomId
): HydratedCharacter {
  const raw = toRawInputs(character)
  const withRow = (patch: Partial<CharacterRow>) =>
    deriveHydratedCharacter({ ...raw, row: { ...raw.row, ...patch } })
  // A pure engine returned a row patch (or rejected the edit): apply it, or
  // leave the character untouched on failure.
  const fromResult = (result: Result<Partial<CharacterRow>, string>) =>
    result.ok ? withRow(result.value) : character
  const conditions = raw.row.battleConditions ?? DEFAULT_BATTLE_CONDITIONS

  switch (edit.kind) {
    case "inventory":
      return reduceInventory(raw, character, edit.mutation, newId)

    case "currency":
      return withRow({ currency: clampCurrency(raw.row.currency + edit.delta) })

    case "ailments":
      return withRow({ ailments: edit.ailments })

    case "battleConditionAxis":
      return withRow({
        battleConditions: {
          ...conditions,
          [edit.axis]: {
            state: edit.state,
            stacks: edit.state === "neutral" ? 0 : 1,
          },
        },
      })

    case "battleConditionFlag":
      return withRow({
        battleConditions: { ...conditions, [edit.flag]: edit.value },
      })

    case "exhaustion": {
      const next =
        edit.direction === "increment"
          ? Math.min(MAX_EXHAUSTION_LEVEL, raw.row.exhaustion + 1)
          : Math.max(0, raw.row.exhaustion - 1)
      return withRow({ exhaustion: next })
    }

    case "usePrisma":
      return fromResult(applyUsePrisma(raw.row))

    case "clearCombatState":
      return withRow({
        ailments: [],
        battleConditions: DEFAULT_BATTLE_CONDITIONS,
      })

    case "valor":
      return withActiveMechanic(raw, character, "valor", (state) =>
        adjustValor(
          state as ValorState,
          edit.direction === "increment" ? 1 : -1
        )
      )

    case "perfection":
      return withActiveMechanic(raw, character, "perfection", (state) =>
        edit.op === "reset"
          ? resetPerfection(state as PerfectionState)
          : adjustPerfection(
              state as PerfectionState,
              edit.op === "increment" ? 1 : -1
            )
      )

    case "stains":
      return withActiveMechanic(raw, character, "stains", (state) =>
        edit.op === "clear"
          ? clearStains(state as StainsState)
          : setStainSlot(state as StainsState, edit.slotIndex, edit.element)
      )

    case "pathOfDawn":
      return withActiveMechanic(raw, character, "path-of-dawn", (state) =>
        setDawnMode(state as PathOfDawnState, edit.dawnMode)
      )

    case "victories":
      return withRow({ victories: Math.max(0, raw.row.victories + edit.delta) })

    case "damage":
      return fromResult(applyDamage(raw.row, edit.amount))

    case "heal":
      return fromResult(
        applyHeal(
          { currentHP: raw.row.currentHP, maxHP: character.maxHP },
          edit.amount
        )
      )

    case "spendSP":
      return fromResult(applySpendSP(raw.row, edit.amount))

    case "recoverSP":
      return fromResult(
        applyRecoverSP(
          { currentSP: raw.row.currentSP, maxSP: character.maxSP },
          edit.amount
        )
      )

    case "cast": {
      const cost = character.skills.find(
        (skill) => skill.key === edit.skillKey
      )?.resolvedCost
      if (!cost) return character
      return fromResult(
        applyResolvedCost(cost, {
          currentHP: raw.row.currentHP,
          currentSP: raw.row.currentSP,
        })
      )
    }

    case "addSpark": {
      const result = addSpark(sparkCharacter(raw), edit.virtue)
      return result.ok ? withRow(sparkRow(result.value)) : character
    }

    case "rankUpVirtue": {
      const result = rankUpVirtue(sparkCharacter(raw), edit.virtue)
      return result.ok ? withRow(sparkRow(result.value)) : character
    }

    case "talentAdd":
      return raw.row.gainedTalents.includes(edit.talentKey)
        ? character
        : withRow({ gainedTalents: [...raw.row.gainedTalents, edit.talentKey] })

    case "talentRemove":
      return withRow({
        gainedTalents: raw.row.gainedTalents.filter(
          (key) => key !== edit.talentKey
        ),
      })
  }
}

/** Projects the spark/virtue columns into the {@link SparkCharacter} the
 *  leveling engine reads. */
function sparkCharacter(raw: RawCharacterInputs): SparkCharacter {
  return {
    sparkLog: raw.row.sparkLog,
    virtues: {
      expression: raw.row.virtueExpression,
      empathy: raw.row.virtueEmpathy,
      wisdom: raw.row.virtueWisdom,
      focus: raw.row.virtueFocus,
    },
  }
}

/** Maps a spark/virtue engine result back onto the flat `characters` columns. */
function sparkRow(value: SparkCharacter): Partial<CharacterRow> {
  return {
    sparkLog: value.sparkLog,
    virtueExpression: value.virtues.expression,
    virtueEmpathy: value.virtues.empathy,
    virtueWisdom: value.virtues.wisdom,
    virtueFocus: value.virtues.focus,
  }
}

/**
 * Applies a transform to the active Archetype's mechanic state (Valor /
 * Perfection live on the `characterArchetype` row, coerced from null via
 * {@link initialStateFor}), then re-derives. Returns the input unchanged when
 * no Archetype is active or its mechanic is unknown.
 */
function withActiveMechanic(
  raw: RawCharacterInputs,
  character: HydratedCharacter,
  mechanicKind: string,
  transform: (state: MechanicState) => MechanicState
): HydratedCharacter {
  const activeId = raw.row.activeArchetypeId
  if (!activeId) return character

  let changed = false
  const archetypeRows = raw.archetypeRows.map((archetype) => {
    if (archetype.id !== activeId) return archetype
    const current = archetype.mechanicState ?? initialStateFor(mechanicKind)
    // Guard the transform's `as`-cast: only apply when the resolved state is
    // actually this mechanic's kind (the active Archetype could carry a
    // different mechanic). UI-gated today, but this keeps the cast honest.
    if (!current || current.kind !== mechanicKind) return archetype
    changed = true
    return { ...archetype, mechanicState: transform(current) }
  })

  return changed
    ? deriveHydratedCharacter({ ...raw, archetypeRows })
    : character
}

function reduceInventory(
  raw: RawCharacterInputs,
  character: HydratedCharacter,
  mutation: InventoryMutation,
  newId: () => string
): HydratedCharacter {
  const projection: InventoryItemState[] = raw.inventoryRows.map((row) => ({
    id: row.id,
    catalogItemKey: row.catalogItemKey,
    equipped: row.equipped,
    quantity: row.quantity,
  }))

  const result = applyInventoryMutation(projection, mutation, newId)
  if (!result.ok) return character

  const inventoryRows = result.value.map((state) => ({
    ...state,
    characterId: raw.row.id,
  }))

  return deriveHydratedCharacter({ ...raw, inventoryRows })
}
