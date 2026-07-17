import { describe, expect, it } from "vitest"

import { templateSetContentSchema, type TemplateSetContent } from "./authoring"
import {
  addTable,
  addTemplate,
  referencedTemplateKeys,
  removeTable,
  removeTemplate,
  restoreTemplate,
  setClosureChance,
  setConnectorTemplateKey,
  tombstoneTemplate,
  updateTable,
  updateTemplate,
} from "./edit"

const empty = (): TemplateSetContent => templateSetContentSchema.parse({})

/** Asserts a transform's output is a fixed point of the load schema — parsing it
 *  again changes nothing, so the editor can safely feed it back through parse at
 *  the save boundary. */
function expectParseFixedPoint(content: TemplateSetContent): void {
  expect(templateSetContentSchema.parse(content)).toEqual(content)
}

describe("addTemplate", () => {
  it("mints an 8-char key, defaults the name, and appends to templateOrder", () => {
    const { content, key } = addTemplate(empty())

    expect(key).toHaveLength(8)
    expect(content.templates[key]).toMatchObject({ key, name: "New template" })
    expect(content.templateOrder).toEqual([key])
    expectParseFixedPoint(content)
  })

  it("honors an explicit name and preserves prior order", () => {
    const first = addTemplate(empty(), "Vault")
    const second = addTemplate(first.content, "Shrine")

    expect(second.content.templates[second.key]!.name).toBe("Shrine")
    expect(second.content.templateOrder).toEqual([first.key, second.key])
  })

  it("does not mutate the input", () => {
    const base = empty()
    addTemplate(base)
    expect(base.templateOrder).toEqual([])
    expect(base.templates).toEqual({})
  })
})

describe("addTable", () => {
  it("mints an 8-char key, defaults the name, and appends to tableOrder", () => {
    const { content, key } = addTable(empty())

    expect(key).toHaveLength(8)
    expect(content.tables[key]).toMatchObject({ key, name: "New table" })
    expect(content.tableOrder).toEqual([key])
    expectParseFixedPoint(content)
  })

  it("honors an explicit name", () => {
    const { content, key } = addTable(empty(), "Loot")
    expect(content.tables[key]!.name).toBe("Loot")
  })
})

describe("updateTemplate", () => {
  it("shallow-merges the patch onto the existing template", () => {
    const { content, key } = addTemplate(empty(), "Vault")
    const next = updateTemplate(content, key, { weight: 3, unique: true })

    expect(next.templates[key]).toMatchObject({
      name: "Vault",
      weight: 3,
      unique: true,
    })
    expectParseFixedPoint(next)
  })

  it("never lets the patch change the record key", () => {
    const { content, key } = addTemplate(empty(), "Vault")
    const next = updateTemplate(content, key, {
      key: "hijacked",
      name: "Renamed",
    } as Partial<(typeof content.templates)[string]>)

    expect(next.templates[key]!.key).toBe(key)
    expect(next.templates.hijacked).toBeUndefined()
    expect(next.templates[key]!.name).toBe("Renamed")
  })

  it("is a no-op for an absent key", () => {
    const base = addTemplate(empty(), "Vault").content
    expect(updateTemplate(base, "missing", { weight: 9 })).toBe(base)
  })
})

describe("updateTable", () => {
  it("shallow-merges the patch onto the existing table", () => {
    const { content, key } = addTable(empty(), "Loot")
    const next = updateTable(content, key, { name: "Rare loot" })

    expect(next.tables[key]!.name).toBe("Rare loot")
    expectParseFixedPoint(next)
  })

  it("never lets the patch change the record key", () => {
    const { content, key } = addTable(empty(), "Loot")
    const next = updateTable(content, key, {
      key: "hijacked",
    } as Partial<(typeof content.tables)[string]>)

    expect(next.tables[key]!.key).toBe(key)
    expect(next.tables.hijacked).toBeUndefined()
  })

  it("is a no-op for an absent key", () => {
    const base = addTable(empty(), "Loot").content
    expect(updateTable(base, "missing", { name: "x" })).toBe(base)
  })
})

describe("setClosureChance", () => {
  it("sets the knob", () => {
    const next = setClosureChance(empty(), 0.42)
    expect(next.closureChance).toBe(0.42)
    expectParseFixedPoint(next)
  })
})

describe("setConnectorTemplateKey", () => {
  it("designates a connector template", () => {
    const { content, key } = addTemplate(empty(), "Corridor")
    const next = setConnectorTemplateKey(content, key)

    expect(next.connectorTemplateKey).toBe(key)
    expectParseFixedPoint(next)
  })

  it("clears the designation by omitting the key", () => {
    const { content, key } = addTemplate(empty(), "Corridor")
    const designated = setConnectorTemplateKey(content, key)
    const cleared = setConnectorTemplateKey(designated, undefined)

    expect("connectorTemplateKey" in cleared).toBe(false)
    expectParseFixedPoint(cleared)
  })
})

describe("tombstoneTemplate / restoreTemplate", () => {
  it("sets and clears the tombstone flag", () => {
    const { content, key } = addTemplate(empty(), "Vault")

    const tombstoned = tombstoneTemplate(content, key)
    expect(tombstoned.templates[key]!.tombstoned).toBe(true)

    const restored = restoreTemplate(tombstoned, key)
    expect(restored.templates[key]!.tombstoned).toBe(false)
    expectParseFixedPoint(tombstoned)
  })

  it("is a no-op for an absent key", () => {
    const base = addTemplate(empty(), "Vault").content
    expect(tombstoneTemplate(base, "missing")).toBe(base)
  })
})

describe("referencedTemplateKeys", () => {
  it("is empty with no connector designated", () => {
    expect(referencedTemplateKeys(empty()).size).toBe(0)
  })

  it("includes the connector template key when set", () => {
    const { content, key } = addTemplate(empty(), "Corridor")
    const withConnector = setConnectorTemplateKey(content, key)
    expect([...referencedTemplateKeys(withConnector)]).toEqual([key])
  })
})

describe("removeTemplate", () => {
  it("hard-deletes an unreferenced template and splices templateOrder", () => {
    const first = addTemplate(empty(), "Vault")
    const second = addTemplate(first.content, "Shrine")
    const next = removeTemplate(second.content, first.key)

    expect(next.templates[first.key]).toBeUndefined()
    expect(next.templateOrder).toEqual([second.key])
    expectParseFixedPoint(next)
  })

  it("tombstones instead of deleting a referenced (connector) template", () => {
    const { content, key } = addTemplate(empty(), "Corridor")
    const withConnector = setConnectorTemplateKey(content, key)
    const next = removeTemplate(withConnector, key)

    // Still present, still ordered, just tombstoned — the reference stays resolvable.
    expect(next.templates[key]!.tombstoned).toBe(true)
    expect(next.templateOrder).toEqual([key])
    expect(next.connectorTemplateKey).toBe(key)
  })

  it("is a no-op for an absent key", () => {
    const base = addTemplate(empty(), "Vault").content
    expect(removeTemplate(base, "missing")).toBe(base)
  })
})

describe("removeTable", () => {
  it("always hard-deletes and splices tableOrder, even when rolled-to", () => {
    const first = addTable(empty(), "Loot")
    const second = addTable(first.content, "Wandering")
    // A template rolls on the first table — a dangling ref is lint's territory,
    // not a blocked delete.
    const templated = addTemplate(second.content)
    const withRoll = updateTemplate(templated.content, templated.key, {
      contentRolls: [{ chance: 1, tableKey: first.key }],
    })

    const next = removeTable(withRoll, first.key)
    expect(next.tables[first.key]).toBeUndefined()
    expect(next.tableOrder).toEqual([second.key])
    expectParseFixedPoint(next)
  })

  it("is a no-op for an absent key", () => {
    const base = addTable(empty(), "Loot").content
    expect(removeTable(base, "missing")).toBe(base)
  })
})
