import { describe, expect, it } from "vitest"

import { resolveInventory } from "@/domain/game-engine-v2"

import {
  buildInventoryRows,
  rowMatchesGroups,
  rowMatchesQuery,
} from "./inventory-table"

const stored = (
  id: string,
  catalogItemKey: string,
  overrides: Partial<{ equipped: boolean; quantity: number }> = {}
) => ({ id, catalogItemKey, equipped: false, quantity: 1, ...overrides })

describe("buildInventoryRows", () => {
  it("flattens slots in display order, consumables last", () => {
    const rows = buildInventoryRows(
      resolveInventory([
        stored("potion", "soul-drop", { quantity: 3 }),
        stored("mail", "bladeturn-mail", { equipped: true }),
        stored("sword", "longsword", { equipped: true }),
        stored("band", "zephyr-band"),
      ])
    )
    expect(rows.map((row) => [row.id, row.group])).toEqual([
      ["sword", "weapon"],
      ["mail", "armor"],
      ["band", "accessory"],
      ["potion", "consumable"],
    ])
  })

  it("carries the capability facts the columns render", () => {
    const rows = buildInventoryRows(
      resolveInventory([
        stored("sword", "longsword", { equipped: true }),
        stored("potion", "soul-drop", { quantity: 3 }),
      ])
    )
    expect(rows[0]).toMatchObject({
      name: "Longsword",
      equipped: true,
      equippable: true,
      stackable: false,
      quantity: 1,
    })
    expect(rows[1]).toMatchObject({
      group: "consumable",
      equippable: false,
      stackable: true,
      stackSize: 999,
      quantity: 3,
    })
  })
})

describe("filter predicates", () => {
  const [row] = buildInventoryRows(resolveInventory([stored("s", "soul-drop")]))

  it("matches query against name and description, case-insensitive", () => {
    expect(rowMatchesQuery(row!, "SOUL")).toBe(true)
    expect(rowMatchesQuery(row!, "")).toBe(true)
    expect(rowMatchesQuery(row!, "   ")).toBe(true)
    expect(rowMatchesQuery(row!, "vorpal")).toBe(false)
  })

  it("treats an empty group selection as no filter", () => {
    expect(rowMatchesGroups(row!, [])).toBe(true)
    expect(rowMatchesGroups(row!, ["consumable"])).toBe(true)
    expect(rowMatchesGroups(row!, ["weapon", "armor"])).toBe(false)
  })
})
