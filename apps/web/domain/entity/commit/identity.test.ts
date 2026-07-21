import { describe, expect, it } from "vitest"

import { applyIdentityWrite, identityWritePatch } from "./identity"
import { identityWriteSchema, type IdentityWrite } from "./identity.schema"

const IDENTITY = {
  name: "Ortus",
  pronouns: "they/them",
  portraitUrl: "https://blob.example/portraits/a.png",
  notes: "Owes the ferryman.",
}

describe("identityWriteSchema", () => {
  it("trims the name and requires one", () => {
    expect(
      identityWriteSchema.parse({ field: "name", value: "  Vela  " })
    ).toEqual({ field: "name", value: "Vela" })
    expect(
      identityWriteSchema.safeParse({ field: "name", value: "   " }).success
    ).toBe(false)
  })

  it("bounds each field at its column's cap", () => {
    const tooLong = (length: number) => "x".repeat(length)
    expect(
      identityWriteSchema.safeParse({ field: "name", value: tooLong(65) })
        .success
    ).toBe(false)
    expect(
      identityWriteSchema.safeParse({ field: "pronouns", value: tooLong(65) })
        .success
    ).toBe(false)
    expect(
      identityWriteSchema.safeParse({ field: "notes", value: tooLong(8001) })
        .success
    ).toBe(false)
    expect(
      identityWriteSchema.safeParse({ field: "notes", value: tooLong(8000) })
        .success
    ).toBe(true)
  })

  it("admits null for every optional column and rejects a non-URL portrait", () => {
    for (const field of ["pronouns", "notes", "portraitUrl"] as const) {
      expect(
        identityWriteSchema.safeParse({ field, value: null }).success
      ).toBe(true)
    }
    expect(
      identityWriteSchema.safeParse({
        field: "portraitUrl",
        value: "not-a-url",
      }).success
    ).toBe(false)
  })

  /**
   * The negative control for the no-transform rule: the client sends the args it
   * constructed and the authority parses them again, so anything the schema
   * *outputs* it must also *admit*. A canonicalizing transform here would produce
   * a `null` the second parse rejects, failing the mutation at the authority.
   */
  it("re-admits its own parsed output for every field", () => {
    const writes: IdentityWrite[] = [
      { field: "name", value: "  Vela  " },
      { field: "pronouns", value: "" },
      { field: "notes", value: "" },
      { field: "portraitUrl", value: null },
    ]

    for (const write of writes) {
      const once = identityWriteSchema.parse(write)
      expect(identityWriteSchema.parse(once)).toEqual(once)
    }
  })
})

describe("identityWritePatch", () => {
  it("sets exactly the written column", () => {
    expect(identityWritePatch({ field: "name", value: "Vela" })).toEqual({
      name: "Vela",
    })
    expect(identityWritePatch({ field: "portraitUrl", value: null })).toEqual({
      portraitUrl: null,
    })
  })

  it("canonicalizes a cleared optional column to null", () => {
    expect(identityWritePatch({ field: "pronouns", value: "  " })).toEqual({
      pronouns: null,
    })
    expect(identityWritePatch({ field: "notes", value: "" })).toEqual({
      notes: null,
    })
  })

  it("keeps a whitespace-bearing note verbatim", () => {
    // Notes is prose: only the empty string means "cleared", so an intentional
    // blank line or trailing space survives (unlike pronouns, which trims).
    expect(identityWritePatch({ field: "notes", value: "  " })).toEqual({
      notes: "  ",
    })
  })
})

describe("applyIdentityWrite", () => {
  it("folds the patch without touching sibling columns", () => {
    expect(
      applyIdentityWrite(IDENTITY, {
        field: "notes",
        value: "Paid the ferryman.",
      })
    ).toEqual({ ...IDENTITY, notes: "Paid the ferryman." })
  })

  it("is pure over its input", () => {
    applyIdentityWrite(IDENTITY, { field: "name", value: "Vela" })
    expect(IDENTITY.name).toBe("Ortus")
  })
})
