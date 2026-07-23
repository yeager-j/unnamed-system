# UNN-694 mutation-environment spike

**Ticket:** UNN-694 — Headcanon spike: centralize the Showtime mutation environment

**Date:** 2026-07-22

**Decision:** Adopt

## Outcome

One app-owned `showtimeMutationEnvironment()` now decides the policy shared by
all five mutation roots:

- trusted actor derivation through `requireActor`;
- Drizzle receipt authority over `getDb()`;
- receipt scope from `actor.userId`;
- app-wide Ably invalidation publication; and
- advisory invalidation-failure reporting.

Each root still calls `createNextMutationAction` directly and registers an
explicit, definition-keyed `bindMutation` list. Protocol choice, command
completeness, and domain behavior remain visible at the composition root.

Dungeon supplies the environment's only variation:
`isContentionError` for its one-active-dungeon constraint. The environment does
not accept domain-operation callbacks or general authority configuration.

## Spike answers

1. **Inference is preserved.** The spread typechecks across entity, combat,
   dungeon, map, and template set without assertions or new package exports.
   Removing a binding still produces `__missingMutationBinding`; pairing a
   definition with the wrong command still fails at `bindMutation`. Headcanon's
   protocol-identity negative controls remain green.
2. **The result contracts.** The affected production surface loses 69 nonblank
   lines and 252 TypeScript scanner tokens, including the shared module.
3. **Dungeon stays specific.** It passes only its proven contention classifier;
   the shared module does not learn Dungeon's constraint or operations.
4. **The command alias removes shared knowledge.**
   `ShowtimeMutationCommand<Mutation, Projection, Evidence>` fixes the app's
   actor, preflight database, and transaction types once while every command
   continues to state its mutation, projection, and admitted evidence.
5. **The publisher has a truthful home.** The entity-named publisher was
   deleted. Its implementation is now private to the app-wide mutation
   environment as `showtimeMutationInvalidations`.

The command literals retain their visible `screen` / `admit` / `execute` /
repeat-safe `finalizeAccepted` lifecycle. Receipt, retry, stamping,
authorization, and finalization semantics are unchanged.

## Measurement

Lexical tokens are TypeScript scanner tokens with comments and whitespace
excluded. The comparison uses the five production `apply.ts` and `commands.ts`
modules plus the before/after shared invalidation/environment module.

| Surface               | Nonblank lines |    Tokens | Delta          |
| --------------------- | -------------: | --------: | -------------- |
| Composition before    |            214 |       786 |                |
| Composition after     |            191 |       672 | −23 / −114     |
| Command typing before |          1,479 |     6,846 |                |
| Command typing after  |          1,433 |     6,708 | −46 / −138     |
| **Total before**      |      **1,693** | **7,632** |                |
| **Total after**       |      **1,624** | **7,380** | **−69 / −252** |

The total is a 4.1% line and 3.3% token contraction across files dominated by
domain command bodies. The composition surface itself contracts 10.7% by lines
and 14.5% by tokens.

## Verification

- All five adopter command suites: 36 tests passed.
- Headcanon: typecheck and dependency gate passed; 195 tests passed and 14
  skipped.
- Web: typecheck, ESLint on every touched source file, and dependency gate
  passed.
- Negative controls: missing registration and wrong command pairing both
  produced the intended compile-time failures before the valid bindings were
  restored.
- Prettier and `git diff --check` passed.
