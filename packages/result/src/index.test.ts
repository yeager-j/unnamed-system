import { describe, expect, it, vi } from "vitest"

import {
  andThen,
  err,
  fromPromise,
  fromThrowable,
  map,
  mapErr,
  match,
  ok,
  unwrapOr,
  type Result,
} from "./index"

function assertPlainEnvelope(result: Result<unknown, unknown>): void {
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(Object.keys(result)).toEqual(
    result.ok ? ["ok", "value"] : ["ok", "error"]
  )
  expect(Reflect.ownKeys(result)).toEqual(
    result.ok ? ["ok", "value"] : ["ok", "error"]
  )

  for (const key of Object.keys(result)) {
    expect(Object.getOwnPropertyDescriptor(result, key)).toMatchObject({
      enumerable: true,
    })
  }
}

class ClassSuccess<T> {
  readonly ok = true as const

  constructor(readonly value: T) {}
}

class ClassFailure<E> {
  readonly ok = false as const

  constructor(readonly error: E) {}
}

describe("constructors", () => {
  it("constructs exact success and failure envelopes", () => {
    const success = ok({ nested: { values: [1, 2, 3] } })
    const failure = err("not-allowed" as const)

    expect(success).toEqual({
      ok: true,
      value: { nested: { values: [1, 2, 3] } },
    })
    expect(failure).toEqual({ ok: false, error: "not-allowed" })
    assertPlainEnvelope(success)
    assertPlainEnvelope(failure)
  })

  it("preserves void and undefined values", () => {
    const result = ok<void>(undefined)

    expect(result).toEqual({ ok: true, value: undefined })
    assertPlainEnvelope(result)
  })

  it("keeps class instances as an explicit envelope negative control", () => {
    expect(() => assertPlainEnvelope(new ClassSuccess(1))).toThrow()
    expect(() => assertPlainEnvelope(new ClassFailure("no"))).toThrow()
  })
})

describe("transformations", () => {
  it("maps successes and short-circuits failures", () => {
    const transform = vi.fn((value: number) => ({ doubled: value * 2 }))

    expect(map(ok(3), transform)).toEqual({
      ok: true,
      value: { doubled: 6 },
    })
    expect(map(err("blocked"), transform)).toEqual({
      ok: false,
      error: "blocked",
    })
    expect(transform).toHaveBeenCalledOnce()
  })

  it("maps failures and short-circuits successes", () => {
    const transform = vi.fn((error: "blocked") => ({ code: error }))

    expect(mapErr(err("blocked" as const), transform)).toEqual({
      ok: false,
      error: { code: "blocked" },
    })
    expect(mapErr(ok(3), transform)).toEqual({ ok: true, value: 3 })
    expect(transform).toHaveBeenCalledOnce()
  })

  it("chains successes, widens failures, and short-circuits input failures", () => {
    const next = vi.fn(
      (value: number): Result<string, "too-small"> =>
        value > 2 ? ok(String(value)) : err("too-small")
    )

    expect(andThen(ok(3), next)).toEqual({ ok: true, value: "3" })
    expect(andThen(ok(1), next)).toEqual({
      ok: false,
      error: "too-small",
    })
    expect(andThen(err("blocked"), next)).toEqual({
      ok: false,
      error: "blocked",
    })
    expect(next).toHaveBeenCalledTimes(2)
  })

  it("normalizes structural class results through the constructors", () => {
    const mapped = map(new ClassSuccess(2), (value) => value + 1)
    const remapped = mapErr(new ClassFailure("old"), () => "new")
    const chained = andThen(
      ok(1),
      (): Result<number, "blocked"> => new ClassSuccess(2)
    )

    expect(mapped).toEqual({ ok: true, value: 3 })
    expect(remapped).toEqual({ ok: false, error: "new" })
    expect(chained).toEqual({ ok: true, value: 2 })
    assertPlainEnvelope(mapped)
    assertPlainEnvelope(remapped)
    assertPlainEnvelope(chained)
  })
})

describe("elimination", () => {
  it("unwraps a success or returns the fallback", () => {
    expect(unwrapOr(ok(3), 10)).toBe(3)
    expect(unwrapOr(err("blocked"), 10)).toBe(10)
  })

  it("matches exactly one arm", () => {
    const handlers = {
      ok: vi.fn((value: number) => `value:${value}`),
      err: vi.fn((error: string) => `error:${error}`),
    }

    expect(match(ok(3), handlers)).toBe("value:3")
    expect(handlers.ok).toHaveBeenCalledOnce()
    expect(handlers.err).not.toHaveBeenCalled()

    expect(match(err("blocked"), handlers)).toBe("error:blocked")
    expect(handlers.err).toHaveBeenCalledOnce()
  })
})

describe("exception boundaries", () => {
  it("maps a thrown value and returns successful operations unchanged", () => {
    expect(
      fromThrowable(
        () => 3,
        () => "failed" as const
      )
    ).toEqual({
      ok: true,
      value: 3,
    })
    expect(
      fromThrowable(
        () => {
          throw new Error("expected")
        },
        (error) => (error instanceof Error ? error.message : "unknown")
      )
    ).toEqual({ ok: false, error: "expected" })
  })

  it("allows a throwable mapper to rethrow unexpected failures", () => {
    const interrupt = new Error("framework-interrupt")

    expect(() =>
      fromThrowable(
        () => {
          throw interrupt
        },
        (error) => {
          throw error
        }
      )
    ).toThrow(interrupt)
  })

  it("maps synchronous throws and promise rejections through one thunk", async () => {
    await expect(
      fromPromise(
        () => Promise.resolve(3),
        () => "failed" as const
      )
    ).resolves.toEqual({ ok: true, value: 3 })
    await expect(
      fromPromise(
        () => {
          throw new Error("sync")
        },
        (error) => (error instanceof Error ? error.message : "unknown")
      )
    ).resolves.toEqual({ ok: false, error: "sync" })
    await expect(
      fromPromise(
        () => Promise.reject(new Error("async")),
        (error) => (error instanceof Error ? error.message : "unknown")
      )
    ).resolves.toEqual({ ok: false, error: "async" })
  })

  it("allows a promise mapper to rethrow unexpected failures", async () => {
    const interrupt = new Error("navigation-interrupt")

    await expect(
      fromPromise(
        () => Promise.reject(interrupt),
        (error) => {
          throw error
        }
      )
    ).rejects.toBe(interrupt)
  })
})

describe("serialization and normalization", () => {
  it("structured-clones representative success and failure values", () => {
    const success = ok({
      text: "ready",
      count: 3,
      nested: [true, null, { optional: undefined }],
    })
    const failure = err({ code: "blocked", detail: [1, 2] })

    expect(structuredClone(success)).toEqual(success)
    expect(structuredClone(failure)).toEqual(failure)
    assertPlainEnvelope(structuredClone(success))
    assertPlainEnvelope(structuredClone(failure))
  })

  it("uses exact plain envelopes for every Result-returning path", async () => {
    const synchronous: Result<unknown, unknown>[] = [
      ok(1),
      err("no"),
      map(ok(1), (value) => value + 1),
      map(err("no"), (value: number) => value + 1),
      mapErr(ok(1), (error: string) => error.length),
      mapErr(err("no"), (error) => error.length),
      andThen(ok(1), (value) => ok(value + 1)),
      andThen(ok(1), () => err("next")),
      andThen(err("first"), (value: number) => ok(value + 1)),
      fromThrowable(
        () => 1,
        () => "no"
      ),
      fromThrowable(
        () => {
          throw "no"
        },
        (error) => error
      ),
    ]
    const asynchronous = [
      await fromPromise(
        () => Promise.resolve(1),
        () => "no"
      ),
      await fromPromise(
        () => Promise.reject("no"),
        (error) => error
      ),
    ]

    for (const result of [...synchronous, ...asynchronous]) {
      assertPlainEnvelope(result)
    }
  })
})
