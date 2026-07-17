import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { andThen, err, map, mapErr, ok, type Result } from "../index"

function expectPlainEnvelope(result: Result<unknown, unknown>): void {
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(Object.keys(result)).toEqual(
    result.ok ? ["ok", "value"] : ["ok", "error"]
  )
}

const resultArbitrary = fc.oneof(
  fc.integer().map((value) => ok(value)),
  fc.string().map((error) => err(error))
)

describe("Result laws", () => {
  it("map obeys identity and composition", () => {
    fc.assert(
      fc.property(resultArbitrary, (result) => {
        expect(map(result, (value) => value)).toEqual(result)
        expect(
          map(
            map(result, (value) => value + 1),
            (value) => value * 2
          )
        ).toEqual(map(result, (value) => (value + 1) * 2))
      })
    )
  })

  it("mapErr obeys symmetric identity and composition", () => {
    fc.assert(
      fc.property(resultArbitrary, (result) => {
        expect(mapErr(result, (error) => error)).toEqual(result)
        expect(
          mapErr(
            mapErr(result, (error) => `${error}!`),
            (error) => error.length
          )
        ).toEqual(mapErr(result, (error) => `${error}!`.length))
      })
    )
  })

  it("andThen obeys left and right identity", () => {
    fc.assert(
      fc.property(fc.integer(), resultArbitrary, (value, result) => {
        const next = (input: number): Result<number, string> =>
          input >= 0 ? ok(input + 1) : err("negative")

        expect(andThen(ok(value), next)).toEqual(next(value))
        expect(andThen(result, ok)).toEqual(result)
      })
    )
  })

  it("andThen never calls the next function for a failure", () => {
    fc.assert(
      fc.property(fc.string(), (error) => {
        let called = false
        const result = andThen(err(error), () => {
          called = true
          return ok(1)
        })

        expect(result).toEqual(err(error))
        expect(called).toBe(false)
      })
    )
  })

  it("constructors preserve a plain envelope for generated payloads", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (value, error) => {
        expectPlainEnvelope(ok(value))
        expectPlainEnvelope(err(error))
      })
    )
  })
})
