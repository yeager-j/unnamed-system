# `@workspace/result`

`@workspace/result` is the dependency-free authority for expected, typed failure
outcomes shared across the workspace. It exports one plain-data `Result` union and
data-first functions from a single entry point.

```ts
import { err, map, ok, type Result } from "@workspace/result"

const parsed: Result<number, "invalid-number"> = ok(4)
const doubled = map(parsed, (value) => value * 2)
const refused = err("invalid-number" as const)
```

Expected domain refusals belong in `Result`. Programmer errors, authorization or
navigation interrupts, framework control flow, and other unexpected failures must
continue to throw. `fromThrowable` and `fromPromise` are selective boundary
adapters: their error mapper decides which caught value is expected and may rethrow
anything else. `fromPromise` accepts a thunk so synchronous setup failures and
promise rejections pass through the same mapper.

## Serialization contract

Every function that returns a `Result` creates the envelope through `ok` or `err`.
The result is therefore exactly `{ ok, value }` or `{ ok, error }`, using enumerable
own properties and `Object.prototype`. Object identity is not part of the API.

That plain envelope is compatible with React's
[Server Function serialization contract](https://react.dev/reference/rsc/use-server#serializable-parameters-and-return-values),
which accepts plain objects and rejects custom class instances. This guarantee is
only about the **envelope**. The caller remains responsible for ensuring the
success value or error payload is supported by the boundary it crosses.

## Utility survey

The package deliberately adopts a small free-function subset after surveying
[NeverThrow's published surface](https://github.com/supermacro/neverthrow).

| Decision | Utilities                                                                                         | Rationale                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adopt    | `map`, `mapErr`, `andThen`, `unwrapOr`, `match`, `fromThrowable`, `fromPromise`                   | Repeated transformations, remaps, short-circuit chains, fallbacks, selective exception adapters, and two true boundary eliminations exist today. |
| Defer    | `orElse`, `combine`, `combineWithAllErrors`, tee/through helpers, plain async aliases/combinators | Current recovery is mostly specialized or async; aggregation has only one clear caller; no second shared side-effect policy exists.              |
| Reject   | `isOk`/`isErr`, fluent classes or custom thenables, generator `safeTry`                           | The `ok` discriminant already narrows directly; the other forms conflict with the plain-data and linear-control-flow design.                     |

Direct branching on `result.ok` remains the default. Use `match` only when both
arms are being exhaustively converted to one return boundary; do not turn existing
guard-clause flows into combinator pipelines for style alone.
