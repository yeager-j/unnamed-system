/**
 * A plain-data outcome for expected failures. Unexpected failures still throw.
 * The envelope is safe across React Server Function boundaries when its payload
 * is also supported by React's serialization contract.
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const map = <T, E, U>(
  result: Result<T, E>,
  transform: (value: T) => U
): Result<U, E> => (result.ok ? ok(transform(result.value)) : err(result.error))

export const mapErr = <T, E, F>(
  result: Result<T, E>,
  transform: (error: E) => F
): Result<T, F> => (result.ok ? ok(result.value) : err(transform(result.error)))

export const andThen = <T, E, U, F>(
  result: Result<T, E>,
  next: (value: T) => Result<U, F>
): Result<U, E | F> => {
  if (!result.ok) return err(result.error)

  const nextResult = next(result.value)
  return nextResult.ok ? ok(nextResult.value) : err(nextResult.error)
}

export const unwrapOr = <T, E, U>(result: Result<T, E>, fallback: U): T | U =>
  result.ok ? result.value : fallback

export const match = <T, E, A, B>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => A
    err: (error: E) => B
  }
): A | B => (result.ok ? handlers.ok(result.value) : handlers.err(result.error))

export const fromThrowable = <T, E>(
  operation: () => T,
  mapError: (error: unknown) => E
): Result<T, E> => {
  try {
    return ok(operation())
  } catch (error) {
    return err(mapError(error))
  }
}

export const fromPromise = async <T, E>(
  operation: () => PromiseLike<T>,
  mapError: (error: unknown) => E
): Promise<Result<T, E>> => {
  try {
    return ok(await operation())
  } catch (error) {
    return err(mapError(error))
  }
}
