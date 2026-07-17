import { describe, expect, it } from "vitest"

import {
  DEFAULT_CLOSURE_CHANCE,
  templateSetContentSchema,
} from "./template-set.schema"

describe("templateSetContentSchema", () => {
  it("mints a valid empty set from {} and is a fixed point", () => {
    const empty = templateSetContentSchema.parse({})

    expect(empty).toStrictEqual({
      templates: {},
      tables: {},
      templateOrder: [],
      tableOrder: [],
      closureChance: DEFAULT_CLOSURE_CHANCE,
    })
    expect(templateSetContentSchema.parse(empty)).toStrictEqual(empty)
  })

  it("heals a pre-closureChance blob to the default", () => {
    const parsed = templateSetContentSchema.parse({
      templates: {},
      tables: {},
    })

    expect(parsed.closureChance).toBe(DEFAULT_CLOSURE_CHANCE)
  })

  it("fills every template default from a bare {key} blob", () => {
    const parsed = templateSetContentSchema.parse({
      templates: { a: { key: "a" } },
    })

    expect(parsed.templates.a).toStrictEqual({
      key: "a",
      name: "",
      description: "",
      dmNotes: "",
      tags: [],
      accepts: [],
      exits: [],
      weight: 1,
      unique: false,
      contentRolls: [],
    })
  })

  it("reconciles templateOrder — drops missing, appends unknown, keeps order", () => {
    const parsed = templateSetContentSchema.parse({
      templates: { a: { key: "a" }, b: { key: "b" }, c: { key: "c" } },
      templateOrder: ["c", "x", "a"],
    })

    expect(parsed.templateOrder).toEqual(["c", "a", "b"])
  })

  it("reconciles tableOrder the same way", () => {
    const parsed = templateSetContentSchema.parse({
      tables: { one: { key: "one" }, two: { key: "two" } },
      tableOrder: ["gone", "two"],
    })

    expect(parsed.tableOrder).toEqual(["two", "one"])
  })

  it("is idempotent under reconciliation", () => {
    const once = templateSetContentSchema.parse({
      templates: { a: { key: "a" }, b: { key: "b" }, c: { key: "c" } },
      templateOrder: ["c", "x", "a"],
      tables: { one: { key: "one" } },
      tableOrder: ["dead"],
    })

    expect(templateSetContentSchema.parse(once)).toStrictEqual(once)
  })
})
