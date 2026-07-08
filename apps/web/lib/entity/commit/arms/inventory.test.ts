import { describe, expect, it } from "vitest"

import { MAX_CURRENCY } from "@workspace/game-v2/items"

import { entityWriteSchema } from "../write.schema"
import { applyEntityWrite } from "../writers"

/**
 * The equipment write family (S2c — UNN-559). The Writer statically imports the
 * real catalog, so rows reference shipped keys: `longsword`/`dagger` (weapons,
 * stackSize 1), `bladeturn-mail` (armor), `soul-drop` (consumable, stackSize
 * 999).
 */

const row = (
  id: string,
  catalogItemKey: string,
  overrides: Partial<{ equipped: boolean; quantity: number }> = {}
) => ({ id, catalogItemKey, equipped: false, quantity: 1, ...overrides })

const bag = (
  items: ReturnType<typeof row>[],
  currency = 0
): { equipment: { items: typeof items; currency: number } } => ({
  equipment: { items, currency },
})

const SEED = "0f37bd58-9f9a-4bb1-b34d-6f7f0e2f8f11"

describe("entityWriteSchema — the equipment arms", () => {
  it.each([
    { component: "equipment", op: "equip", itemId: "a" },
    { component: "equipment", op: "unequip", itemId: "a" },
    { component: "equipment", op: "remove", itemId: "a" },
    {
      component: "equipment",
      op: "add",
      catalogItemKey: "soul-drop",
      quantity: 3,
      idSeed: SEED,
    },
    { component: "equipment", op: "setQuantity", itemId: "a", quantity: 0 },
    { component: "equipment", op: "setCurrency", amount: 120 },
  ])("accepts %j", (write) => {
    expect(entityWriteSchema.safeParse(write).success).toBe(true)
  })

  it.each([
    // idSeed too short / illegal characters — the determinism seam is bounded.
    {
      component: "equipment",
      op: "add",
      catalogItemKey: "soul-drop",
      quantity: 1,
      idSeed: "short",
    },
    {
      component: "equipment",
      op: "add",
      catalogItemKey: "soul-drop",
      quantity: 1,
      idSeed: "has spaces has spaces",
    },
    // add without a seed at all
    { component: "equipment", op: "add", catalogItemKey: "x", quantity: 1 },
    // zero/negative/fractional quantities
    {
      component: "equipment",
      op: "add",
      catalogItemKey: "soul-drop",
      quantity: 0,
      idSeed: SEED,
    },
    {
      component: "equipment",
      op: "setQuantity",
      itemId: "a",
      quantity: -1,
    },
    {
      component: "equipment",
      op: "setQuantity",
      itemId: "a",
      quantity: 1.5,
    },
    // wallet bounds
    { component: "equipment", op: "setCurrency", amount: -1 },
    { component: "equipment", op: "setCurrency", amount: MAX_CURRENCY + 1 },
    // foreign op
    { component: "equipment", op: "consume", itemId: "a" },
  ])("rejects %j", (write) => {
    expect(entityWriteSchema.safeParse(write).success).toBe(false)
  })
})

describe("applyEntityWrite — equipment item ops", () => {
  it("equip swaps the same-slot occupant in one write", () => {
    const components = bag([
      row("sword", "longsword", { equipped: true }),
      row("knife", "dagger"),
      row("mail", "bladeturn-mail", { equipped: true }),
    ])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "equip",
      itemId: "knife",
    })
    expect(result.ok && result.value.equipment?.items).toEqual([
      row("sword", "longsword", { equipped: false }),
      row("knife", "dagger", { equipped: true }),
      // A different slot is never a swap conflict.
      row("mail", "bladeturn-mail", { equipped: true }),
    ])
  })

  it("item ops preserve the wallet in the patched component", () => {
    const components = bag([row("sword", "longsword")], 250)
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "equip",
      itemId: "sword",
    })
    expect(result.ok && result.value.equipment?.currency).toBe(250)
  })

  it("unequip clears the flag", () => {
    const components = bag([row("sword", "longsword", { equipped: true })])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "unequip",
      itemId: "sword",
    })
    expect(result.ok && result.value.equipment?.items[0]?.equipped).toBe(false)
  })

  it("remove drops the row even while equipped", () => {
    const components = bag([row("sword", "longsword", { equipped: true })])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "remove",
      itemId: "sword",
    })
    expect(result.ok && result.value.equipment?.items).toEqual([])
  })

  it.each(["equip", "unequip", "remove"] as const)(
    "%s refuses item-not-found on a missing row",
    (op) => {
      const result = applyEntityWrite(bag([]), {
        component: "equipment",
        op,
        itemId: "ghost",
      })
      expect(result).toEqual({ ok: false, error: "item-not-found" })
    }
  )

  it("equip refuses catalog-item-unknown for a non-equippable row", () => {
    const components = bag([row("potion", "soul-drop")])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "equip",
      itemId: "potion",
    })
    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it.each(["equip", "unequip", "remove", "setQuantity"] as const)(
    "%s refuses capability-missing when the entity carries no inventory",
    (op) => {
      const result = applyEntityWrite({}, {
        component: "equipment",
        op,
        itemId: "a",
        quantity: 1,
      } as never)
      expect(result).toEqual({ ok: false, error: "capability-missing" })
    }
  )
})

describe("applyEntityWrite — equipment add (the idSeed determinism seam)", () => {
  it("tops up an existing stack, then overflows into seeded rows", () => {
    const components = bag([
      row("stack", "soul-drop", { quantity: 998 }), // stackSize 999
    ])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "add",
      catalogItemKey: "soul-drop",
      quantity: 3,
      idSeed: SEED,
    })
    expect(result.ok && result.value.equipment?.items).toEqual([
      row("stack", "soul-drop", { quantity: 999 }),
      row(`${SEED}-0`, "soul-drop", { quantity: 2 }),
    ])
  })

  it("mints one deterministic row per unit for a non-stackable item", () => {
    const result = applyEntityWrite(bag([]), {
      component: "equipment",
      op: "add",
      catalogItemKey: "longsword",
      quantity: 2,
      idSeed: SEED,
    })
    expect(result.ok && result.value.equipment?.items).toEqual([
      row(`${SEED}-0`, "longsword"),
      row(`${SEED}-1`, "longsword"),
    ])
  })

  it("creates the component from absent (a wallet-less draft gains one)", () => {
    const result = applyEntityWrite(
      {},
      {
        component: "equipment",
        op: "add",
        catalogItemKey: "longsword",
        quantity: 1,
        idSeed: SEED,
      }
    )
    expect(result.ok && result.value.equipment).toEqual({
      items: [row(`${SEED}-0`, "longsword")],
      currency: 0,
    })
  })

  it("refuses catalog-item-unknown for an unshipped key", () => {
    const result = applyEntityWrite(bag([]), {
      component: "equipment",
      op: "add",
      catalogItemKey: "vorpal-blade",
      quantity: 1,
      idSeed: SEED,
    })
    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it("refuses duplicate-item-id on a replayed seed", () => {
    const components = bag([row(`${SEED}-0`, "longsword")])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "add",
      catalogItemKey: "longsword",
      quantity: 1,
      idSeed: SEED,
    })
    expect(result).toEqual({ ok: false, error: "duplicate-item-id" })
  })
})

describe("applyEntityWrite — equipment setQuantity", () => {
  it("clamps to the catalog stackSize", () => {
    const components = bag([row("stack", "soul-drop", { quantity: 5 })])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "setQuantity",
      itemId: "stack",
      quantity: 999999,
    })
    expect(result.ok && result.value.equipment?.items[0]?.quantity).toBe(999)
  })

  it("drops the row at 0", () => {
    const components = bag([row("stack", "soul-drop", { quantity: 5 })])
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "setQuantity",
      itemId: "stack",
      quantity: 0,
    })
    expect(result.ok && result.value.equipment?.items).toEqual([])
  })
})

describe("applyEntityWrite — equipment setCurrency (the wallet)", () => {
  it("sets the absolute amount, leaving rows untouched", () => {
    const components = bag([row("sword", "longsword")], 10)
    const result = applyEntityWrite(components, {
      component: "equipment",
      op: "setCurrency",
      amount: 120,
    })
    expect(result.ok && result.value.equipment).toEqual({
      items: [row("sword", "longsword")],
      currency: 120,
    })
  })

  it("creates the component from absent", () => {
    const result = applyEntityWrite(
      {},
      { component: "equipment", op: "setCurrency", amount: 42 }
    )
    expect(result.ok && result.value.equipment).toEqual({
      items: [],
      currency: 42,
    })
  })
})
