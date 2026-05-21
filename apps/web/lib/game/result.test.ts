import { describe, expect, it } from "vitest"

import { err, ok } from "./result"

describe("Result constructors", () => {
  it("ok wraps a value as a success", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 })
  })

  it("err wraps an error as a failure", () => {
    expect(err("nope")).toEqual({ ok: false, error: "nope" })
  })
})
