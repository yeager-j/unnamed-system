import { describe, expectTypeOf, it } from "vitest"

import {
  andThen,
  err,
  fromPromise,
  map,
  mapErr,
  match,
  ok,
  unwrapOr,
  type Result,
} from "./index"

describe("Result types", () => {
  it("preserves constructor literals and never inference", () => {
    expectTypeOf(ok("ready" as const)).toEqualTypeOf<Result<"ready", never>>()
    expectTypeOf(err("blocked" as const)).toEqualTypeOf<
      Result<never, "blocked">
    >()
    expectTypeOf(ok<void>(undefined)).toEqualTypeOf<Result<void, never>>()
  })

  it("accepts direct object envelopes", () => {
    const success: Result<number, "blocked"> = { ok: true, value: 1 }
    const failure: Result<number, "blocked"> = {
      ok: false,
      error: "blocked",
    }

    expectTypeOf(success).toMatchTypeOf<Result<number, "blocked">>()
    expectTypeOf(failure).toMatchTypeOf<Result<number, "blocked">>()
  })

  it("types transformations and eliminators", () => {
    const source = (): Result<"value", "first"> => ok("value")
    const mapped = map(source(), () => 1 as const)
    const remapped = mapErr(source(), () => "second" as const)
    const chained = andThen(
      source(),
      () => err("second" as const) as Result<boolean, "second">
    )
    const unwrapped = unwrapOr(source(), 0 as const)
    const matched = match(source(), {
      ok: () => "success" as const,
      err: () => 404 as const,
    })

    expectTypeOf(mapped).toEqualTypeOf<Result<1, "first">>()
    expectTypeOf(remapped).toEqualTypeOf<Result<"value", "second">>()
    expectTypeOf(chained).toEqualTypeOf<Result<boolean, "first" | "second">>()
    expectTypeOf(unwrapped).toEqualTypeOf<"value" | 0>()
    expectTypeOf(matched).toEqualTypeOf<"success" | 404>()
  })

  it("types awaited promise results", () => {
    const _promised = fromPromise(
      () => Promise.resolve("ready" as const),
      () => "blocked" as const
    )

    expectTypeOf<Awaited<typeof _promised>>().toEqualTypeOf<
      Result<"ready", "blocked">
    >()
  })
})
