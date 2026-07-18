/**
 * Framework-agnostic contract-law support. Laws are plain named async
 * functions so consumers can mount them on any test runner:
 *
 *   for (const law of verifyReplicaContract(options)) it(law.name, law.run)
 *
 * Assertions throw `ContractViolation` with a readable message instead of
 * depending on a test framework's expect.
 */
export interface ContractLaw {
  readonly name: string
  run(): Promise<void>
}

export class ContractViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContractViolation"
  }
}

export function invariant(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new ContractViolation(message)
}

export function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  label: string
): void {
  if (!deepEqual(actual, expected)) {
    throw new ContractViolation(
      `${label}\n  actual:   ${describe(actual)}\n  expected: ${describe(expected)}`
    )
  }
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Structural equality over serializable protocol values. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== "object") return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((item, index) => deepEqual(item, b[index]))
  }

  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (!deepEqual(left[key], right[key])) return false
  }
  return true
}

/** One macrotask turn — lets queued microtasks and immediate timers drain. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** A few turns, for pipelines that hop the microtask queue more than once. */
export async function settle(turns = 5): Promise<void> {
  for (let i = 0; i < turns; i += 1) await tick()
}

/**
 * Polls an assertion until it stops throwing. Used where adapters do real
 * async work (fetches, subscriptions) with no synchronous completion signal.
 */
export async function eventually(
  check: () => void | Promise<void>,
  timeoutMs = 1000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await check()
      return
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
}

/** Resolves true if the promise is still unsettled after the queue drains. */
export async function isUnsettled(promise: Promise<unknown>): Promise<boolean> {
  const sentinel = Symbol("unsettled")
  const raced = await Promise.race([promise, settle().then(() => sentinel)])
  return raced === sentinel
}
