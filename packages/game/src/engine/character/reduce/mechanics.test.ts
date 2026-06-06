import { describe, expect, it } from "vitest"

import {
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/index"
import { reduceMechanicEdit } from "@workspace/game/engine/character/reduce/mechanics"
import type { MechanicEdit } from "@workspace/game/foundation/character/character-edit"
import type { MechanicState } from "@workspace/game/mechanics"

const ACTIVE = "active-arch"

/** A character whose active Archetype carries `mechanicState` (null seeds the
 *  "no state persisted yet" case the reducer coerces via `initialStateFor`). */
function withActiveMechanic(mechanicState: MechanicState | null) {
  return makeRawCharacterInputs({
    row: { activeArchetypeId: ACTIVE },
    archetypeRows: [makeArchetypeRow({ id: ACTIVE, mechanicState })],
  })
}

const resultState = (raw: ReturnType<typeof reduceMechanicEdit>) =>
  raw?.archetypeRows.find((row) => row.id === ACTIVE)?.mechanicState

describe("reduceMechanicEdit — transitions", () => {
  it("increments / decrements Valor", () => {
    expect(
      resultState(
        reduceMechanicEdit(withActiveMechanic({ kind: "valor", value: 2 }), {
          kind: "valor",
          direction: "increment",
        })
      )
    ).toEqual({ kind: "valor", value: 3 })
    expect(
      resultState(
        reduceMechanicEdit(withActiveMechanic({ kind: "valor", value: 2 }), {
          kind: "valor",
          direction: "decrement",
        })
      )
    ).toEqual({ kind: "valor", value: 1 })
  })

  it("increments / decrements / resets Perfection", () => {
    const seed = () => withActiveMechanic({ kind: "perfection", rank: 2 })
    expect(
      resultState(
        reduceMechanicEdit(seed(), { kind: "perfection", op: "increment" })
      )
    ).toEqual({ kind: "perfection", rank: 3 })
    expect(
      resultState(
        reduceMechanicEdit(seed(), { kind: "perfection", op: "decrement" })
      )
    ).toEqual({ kind: "perfection", rank: 1 })
    expect(
      resultState(
        reduceMechanicEdit(seed(), { kind: "perfection", op: "reset" })
      )
    ).toEqual({ kind: "perfection", rank: 0 })
  })

  it("sets one Stain slot and clears all slots", () => {
    expect(
      resultState(
        reduceMechanicEdit(
          withActiveMechanic({
            kind: "stains",
            tokens: [null, null, null, null],
          }),
          { kind: "stains", op: "setSlot", slotIndex: 1, element: "fire" }
        )
      )
    ).toEqual({ kind: "stains", tokens: [null, "fire", null, null] })
    expect(
      resultState(
        reduceMechanicEdit(
          withActiveMechanic({
            kind: "stains",
            tokens: ["fire", "ice", null, null],
          }),
          { kind: "stains", op: "clear" }
        )
      )
    ).toEqual({ kind: "stains", tokens: [null, null, null, null] })
  })

  it("sets Dawn / Dusk Mode", () => {
    expect(
      resultState(
        reduceMechanicEdit(
          withActiveMechanic({ kind: "path-of-dawn", dawnMode: false }),
          { kind: "pathOfDawn", dawnMode: true }
        )
      )
    ).toEqual({ kind: "path-of-dawn", dawnMode: true })
    expect(
      resultState(
        reduceMechanicEdit(
          withActiveMechanic({ kind: "path-of-dusk", duskMode: false }),
          { kind: "pathOfDusk", duskMode: true }
        )
      )
    ).toEqual({ kind: "path-of-dusk", duskMode: true })
  })
})

/**
 * One row per mechanic edit, exercising each branch's guards uniformly: every
 * `case` resolves the active mechanic, coerces a null state to the initial one,
 * and no-ops (returns null) when there is no active Archetype, the row is
 * missing, or the persisted mechanic's kind doesn't match the edit. `mismatch`
 * is a state of a *different* mechanic, which the discriminant guard must reject.
 */
const CASES: ReadonlyArray<{
  name: string
  edit: MechanicEdit
  /** Applying `edit` to the mechanic's initial (empty) state. */
  fromInitial: MechanicState
  mismatch: MechanicState
}> = [
  {
    name: "valor",
    edit: { kind: "valor", direction: "increment" },
    fromInitial: { kind: "valor", value: 1 },
    mismatch: { kind: "perfection", rank: 0 },
  },
  {
    name: "perfection",
    edit: { kind: "perfection", op: "increment" },
    fromInitial: { kind: "perfection", rank: 1 },
    mismatch: { kind: "valor", value: 0 },
  },
  {
    name: "stains",
    edit: { kind: "stains", op: "setSlot", slotIndex: 0, element: "fire" },
    fromInitial: { kind: "stains", tokens: ["fire", null, null, null] },
    mismatch: { kind: "valor", value: 0 },
  },
  {
    name: "pathOfDawn",
    edit: { kind: "pathOfDawn", dawnMode: true },
    fromInitial: { kind: "path-of-dawn", dawnMode: true },
    mismatch: { kind: "valor", value: 0 },
  },
  {
    name: "pathOfDusk",
    edit: { kind: "pathOfDusk", duskMode: true },
    fromInitial: { kind: "path-of-dusk", duskMode: true },
    mismatch: { kind: "valor", value: 0 },
  },
]

describe.each(CASES)(
  "reduceMechanicEdit — $name guards",
  ({ edit, fromInitial, mismatch }) => {
    it("coerces a null mechanic state to the initial state before applying", () => {
      expect(
        resultState(reduceMechanicEdit(withActiveMechanic(null), edit))
      ).toEqual(fromInitial)
    })

    it("returns null when no Archetype is active", () => {
      const raw = makeRawCharacterInputs({
        archetypeRows: [makeArchetypeRow({ id: ACTIVE })],
      })
      expect(reduceMechanicEdit(raw, edit)).toBeNull()
    })

    it("returns null when the active Archetype row is missing", () => {
      const raw = makeRawCharacterInputs({
        row: { activeArchetypeId: "ghost" },
        archetypeRows: [makeArchetypeRow({ id: ACTIVE })],
      })
      expect(reduceMechanicEdit(raw, edit)).toBeNull()
    })

    it("returns null when the persisted mechanic's kind does not match the edit", () => {
      expect(reduceMechanicEdit(withActiveMechanic(mismatch), edit)).toBeNull()
    })
  }
)

it("leaves the other Archetype rows untouched", () => {
  const raw = makeRawCharacterInputs({
    row: { activeArchetypeId: ACTIVE },
    archetypeRows: [
      makeArchetypeRow({
        id: ACTIVE,
        mechanicState: { kind: "valor", value: 2 },
      }),
      makeArchetypeRow({
        id: "other",
        mechanicState: { kind: "valor", value: 5 },
      }),
    ],
  })
  const out = reduceMechanicEdit(raw, { kind: "valor", direction: "increment" })
  expect(
    out?.archetypeRows.find((row) => row.id === "other")?.mechanicState
  ).toEqual({ kind: "valor", value: 5 })
})
