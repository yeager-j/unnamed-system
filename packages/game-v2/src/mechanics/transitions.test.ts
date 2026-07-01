import { describe, expect, it } from "vitest"

import type { MechanicKind } from "@workspace/game-v2/kernel/vocab/mechanics"

import { getTypedMechanic, MECHANICS } from "./registry"

/**
 * The write-side transition surface (UNN-520; CD19): which mechanics ship one,
 * that each schema accepts its own descriptors and rejects foreign ones, and
 * that `apply` dispatches to the module's pure ops (whose behavior the
 * per-module tests already cover).
 */

const WITH_TRANSITIONS: MechanicKind[] = [
  "perfection",
  "valor",
  "frenzy",
  "stains",
  "path-of-dawn",
  "path-of-dusk",
]

const WITHOUT_TRANSITIONS: MechanicKind[] = [
  "thiefs-insight",
  "elemental-larceny",
  "enchantment",
]

describe("MechanicDefinition.transitions — coverage", () => {
  it.each(WITH_TRANSITIONS)("%s ships a transitions surface", (kind) => {
    expect(getTypedMechanic(kind).transitions).toBeDefined()
  })

  it.each(WITHOUT_TRANSITIONS)(
    "%s (no player-driven state write) ships none",
    (kind) => {
      expect(getTypedMechanic(kind).transitions).toBeUndefined()
    }
  )

  it("the two lists cover the whole registry", () => {
    expect([...WITH_TRANSITIONS, ...WITHOUT_TRANSITIONS].sort()).toEqual(
      MECHANICS.map((mechanic) => mechanic.kind).sort()
    )
  })
})

describe("MechanicDefinition.transitions — schema validates the descriptor", () => {
  it("accepts each mechanic's own descriptors", () => {
    const cases: [MechanicKind, unknown][] = [
      ["perfection", { op: "adjust", delta: -1 }],
      ["perfection", { op: "reset" }],
      ["valor", { op: "adjust", delta: 2 }],
      ["frenzy", { op: "adjustPain", delta: 1 }],
      ["frenzy", { op: "setFrenzyMode", value: true }],
      ["stains", { op: "setSlot", slotIndex: 2, element: "fire" }],
      ["stains", { op: "setSlot", slotIndex: 0, element: null }],
      ["stains", { op: "clear" }],
      ["path-of-dawn", { op: "setMode", value: true }],
      ["path-of-dusk", { op: "setMode", value: false }],
    ]
    for (const [kind, descriptor] of cases) {
      const parsed =
        getTypedMechanic(kind).transitions!.schema.safeParse(descriptor)
      expect(parsed.success, `${kind} ${JSON.stringify(descriptor)}`).toBe(true)
    }
  })

  it("rejects a foreign descriptor (a valor op sent to perfection)", () => {
    const parsed = getTypedMechanic("perfection").transitions!.schema.safeParse(
      { op: "setMode", value: true }
    )
    expect(parsed.success).toBe(false)
  })

  it("rejects an out-of-range stains slot", () => {
    const parsed = getTypedMechanic("stains").transitions!.schema.safeParse({
      op: "setSlot",
      slotIndex: 9,
      element: "fire",
    })
    expect(parsed.success).toBe(false)
  })
})

describe("MechanicDefinition.transitions — apply dispatches to the pure ops", () => {
  it("perfection: adjust clamps at S, reset returns to D", () => {
    const { transitions, initialState } = getTypedMechanic("perfection")
    const climbed = transitions!.apply(initialState(), {
      op: "adjust",
      delta: 99,
    })
    expect(climbed.rank).toBe(4)
    expect(transitions!.apply(climbed, { op: "reset" }).rank).toBe(0)
  })

  it("frenzy: setFrenzyMode refuses entry at 0 Pain (the module's guard)", () => {
    const { transitions, initialState } = getTypedMechanic("frenzy")
    const next = transitions!.apply(initialState(), {
      op: "setFrenzyMode",
      value: true,
    })
    expect(next.frenzyMode).toBe(false)
  })

  it("stains: setSlot writes one slot, clear empties all", () => {
    const { transitions, initialState } = getTypedMechanic("stains")
    const stained = transitions!.apply(initialState(), {
      op: "setSlot",
      slotIndex: 1,
      element: "ice",
    })
    expect(stained.tokens).toEqual([null, "ice", null, null])
    expect(transitions!.apply(stained, { op: "clear" }).tokens).toEqual([
      null,
      null,
      null,
      null,
    ])
  })
})
