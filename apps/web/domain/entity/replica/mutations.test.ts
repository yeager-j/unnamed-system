import { describe, expect, it } from "vitest"

import {
  applyEntityColumnWrite,
  entityColumnPatch,
  entityColumnWriteSchema,
  type EntityReplicaState,
} from "./mutations"

const initial: EntityReplicaState = {
  components: {
    identity: { name: "Momo" },
    presentation: { portraitUrl: "https://example.test/momo.png" },
    vitals: { base: 10, damage: 0 },
  },
  columns: {
    name: "Momo",
    portraitUrl: "https://example.test/momo.png",
    pronouns: "she/her",
    notes: "Old note",
  },
}

describe("entity.setColumn", () => {
  it("canonicalizes and validates every admitted column arm", () => {
    expect(
      entityColumnWriteSchema.parse({ column: "name", value: "  Iris  " })
    ).toEqual({ column: "name", value: "Iris" })
    expect(
      entityColumnWriteSchema.parse({ column: "pronouns", value: "they/them" })
    ).toEqual({ column: "pronouns", value: "they/them" })
    expect(
      entityColumnWriteSchema.parse({ column: "notes", value: "" })
    ).toEqual({ column: "notes", value: "" })
    expect(
      entityColumnWriteSchema.parse({ column: "portraitUrl", value: null })
    ).toEqual({ column: "portraitUrl", value: null })
    expect(
      entityColumnWriteSchema.safeParse({
        column: "portraitUrl",
        value: "https://untrusted.test/image.png",
      }).success
    ).toBe(false)
    expect(
      entityColumnWriteSchema.safeParse({ column: "name", value: "   " })
        .success
    ).toBe(false)
    expect(
      entityColumnWriteSchema.safeParse({
        column: "pronouns",
        value: "p".repeat(65),
      }).success
    ).toBe(false)
    expect(
      entityColumnWriteSchema.safeParse({
        column: "notes",
        value: "n".repeat(8001),
      }).success
    ).toBe(false)
  })

  it("updates name in both the app column and lifted identity component", () => {
    const next = applyEntityColumnWrite(initial, {
      column: "name",
      value: "Iris",
    })

    expect(next.columns.name).toBe("Iris")
    expect(next.components.identity).toEqual({ name: "Iris" })
    expect(next.components.vitals).toBe(initial.components.vitals)
  })

  it("canonicalizes empty pronouns and notes to null storage values", () => {
    expect(
      applyEntityColumnWrite(initial, { column: "pronouns", value: "  " })
        .columns.pronouns
    ).toBeNull()
    expect(
      applyEntityColumnWrite(initial, { column: "notes", value: "" }).columns
        .notes
    ).toBeNull()
  })

  it("removes portrait state from the app column and lifted component", () => {
    const next = applyEntityColumnWrite(initial, {
      column: "portraitUrl",
      value: null,
    })

    expect(next.columns.portraitUrl).toBeNull()
    expect(next.components.presentation).toEqual({ portraitUrl: undefined })
  })

  it("produces an exact one-column authority patch", () => {
    expect(entityColumnPatch({ column: "name", value: "Iris" })).toEqual({
      name: "Iris",
    })
    expect(entityColumnPatch({ column: "pronouns", value: "  " })).toEqual({
      pronouns: null,
    })
    expect(entityColumnPatch({ column: "notes", value: "" })).toEqual({
      notes: null,
    })
    expect(entityColumnPatch({ column: "portraitUrl", value: null })).toEqual({
      portraitUrl: null,
    })
  })

  it("reapplies desired-value intent over a newer accepted base", () => {
    const newer: EntityReplicaState = {
      ...initial,
      columns: { ...initial.columns, name: "External" },
      components: { ...initial.components, identity: { name: "External" } },
    }

    expect(
      applyEntityColumnWrite(newer, { column: "name", value: "Local" })
    ).toMatchObject({
      columns: { name: "Local" },
      components: { identity: { name: "Local" } },
    })
  })
})
