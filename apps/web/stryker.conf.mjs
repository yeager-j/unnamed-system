// @ts-check

/**
 * Mutation testing for the pure game engine (UNN-351). Stryker measures what
 * coverage cannot: of the plausible mistakes we could introduce, what fraction
 * do the tests actually catch (the *mutation score*) — the by-hand "reintroduce
 * the bug, confirm red" check from PR #160, automated.
 *
 * **Prototype scope.** `mutate` is deliberately ONE module so we can record a
 * baseline score and triage survivors before deciding whether the runtime earns
 * an engine-wide rollout. `combat/attack-roll.ts` is a good probe: rich
 * branching, already well-tested, but with a few uncovered branches — so a
 * healthy-but-imperfect score validates that Stryker finds real gaps. Widen
 * `mutate` to `lib/game/**` only after the go/no-go (and likely off the PR
 * critical path — a full engine run is far slower than the ~1s suite).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  // `off` runs the full suite per mutant: slower, but deterministic. `perTest`
  // (only the covering tests) is the speed play for an engine-wide rollout, but
  // on this module it gave flaky timeout classification — the same mutant
  // flipping killed/survived between runs — which makes the score untrustworthy.
  // For a one-module prototype, determinism wins; revisit perTest when widening.
  coverageAnalysis: "off",
  mutate: ["lib/game/combat/attack-roll.ts"],
  reporters: ["html", "json", "clear-text", "progress"],
  // No `thresholds.break`: like the coverage report, the score is informational
  // for now — read the surviving mutants, don't gate a build on the number.
  vitest: { configFile: "vitest.config.ts" },
}
