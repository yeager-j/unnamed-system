import {
  adjustPerfection,
  adjustValor,
  clearStains,
  initialStateFor,
  resetPerfection,
  setDawnMode,
  setStainSlot,
  type MechanicState,
} from "../../mechanics"
import type { CharacterEdit } from "../character-edit"
import type { RawCharacterInputs } from "../derive-hydrated-character"
import type { SliceResult } from "./shared"

type MechanicEdit = Extract<
  CharacterEdit,
  { kind: "valor" | "perfection" | "stains" | "pathOfDawn" }
>

/**
 * Mechanics slice: steps the active Archetype's unique mechanic (Valor /
 * Perfection / Stains / Path of Dawn), which lives on the `characterArchetype`
 * row's `mechanicState` column. Each branch resolves the active mechanic, then
 * narrows it with a literal discriminant check — `current.kind !== "valor"`
 * narrows `current` to `ValorState` — so the pure transition typechecks without
 * a cast. A non-matching mechanic, or no active Archetype, is a no-op (`null`).
 *
 * Per-Lineage power differences are config in the `MECHANICS_BY_KIND` registry,
 * not new edit kinds; a future Lineage variant adds an entry there and reuses
 * these same operations.
 */
export function reduceMechanicEdit(
  raw: RawCharacterInputs,
  edit: MechanicEdit
): SliceResult {
  switch (edit.kind) {
    case "valor": {
      const active = activeMechanicState(raw, "valor")
      if (!active || active.current.kind !== "valor") return null
      return writeMechanic(
        raw,
        active.activeId,
        adjustValor(active.current, edit.direction === "increment" ? 1 : -1)
      )
    }

    case "perfection": {
      const active = activeMechanicState(raw, "perfection")
      if (!active || active.current.kind !== "perfection") return null
      const next =
        edit.op === "reset"
          ? resetPerfection(active.current)
          : adjustPerfection(active.current, edit.op === "increment" ? 1 : -1)
      return writeMechanic(raw, active.activeId, next)
    }

    case "stains": {
      const active = activeMechanicState(raw, "stains")
      if (!active || active.current.kind !== "stains") return null
      const next =
        edit.op === "clear"
          ? clearStains(active.current)
          : setStainSlot(active.current, edit.slotIndex, edit.element)
      return writeMechanic(raw, active.activeId, next)
    }

    case "pathOfDawn": {
      const active = activeMechanicState(raw, "path-of-dawn")
      if (!active || active.current.kind !== "path-of-dawn") return null
      return writeMechanic(
        raw,
        active.activeId,
        setDawnMode(active.current, edit.dawnMode)
      )
    }
  }
}

/**
 * Resolves the active Archetype's current mechanic state, coercing a null
 * `mechanicState` to {@link initialStateFor}`(mechanicKind)` — so a first edit
 * on a fresh Archetype starts from the empty state. Returns `null` when no
 * Archetype is active, its row is missing, or `mechanicKind` is unknown.
 */
function activeMechanicState(
  raw: RawCharacterInputs,
  mechanicKind: string
): { activeId: string; current: MechanicState } | null {
  const activeId = raw.row.activeArchetypeId
  if (!activeId) return null

  const archetype = raw.archetypeRows.find((row) => row.id === activeId)
  if (!archetype) return null

  const current = archetype.mechanicState ?? initialStateFor(mechanicKind)
  if (!current) return null

  return { activeId, current }
}

/** Writes `next` onto the active Archetype's `mechanicState`, leaving the
 *  other Archetype rows untouched. */
function writeMechanic(
  raw: RawCharacterInputs,
  activeId: string,
  next: MechanicState
): RawCharacterInputs {
  return {
    ...raw,
    archetypeRows: raw.archetypeRows.map((archetype) =>
      archetype.id === activeId
        ? { ...archetype, mechanicState: next }
        : archetype
    ),
  }
}
