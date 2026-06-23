// @ts-check

/**
 * Mutation testing for the `game-v2` logic layer (UNN-499, carries over
 * UNN-351's conventions to the domain-first layout — D33). `mutate` is "logic
 * files" = every TypeScript file under `src` minus the things that aren't engine
 * rules: the `*.schema.ts` pure authored shapes, the `catalog` authored data,
 * the `composition` wiring, the `__fixtures__` test doubles, and the tests. Off
 * the PR critical path (a full run is far slower than the suite); run manually or
 * nightly, and scope `mutate` to changed files when iterating.
 *
 * Largely inert until the domain folders are populated by their PRs — PR1 ships
 * the kernel substrate, so the first real mutants appear as logic lands.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  coverageAnalysis: "off",
  mutate: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.schema.ts",
    "!src/catalog/**",
    "!src/composition.ts",
    // Test doubles, not engine rules — mutating them is noise (no test asserts on
    // a fixture's internals). Mirrors vitest.config's coverage exclude.
    "!src/**/__fixtures__/**",
  ],
  reporters: ["html", "json", "clear-text", "progress"],
  // Run against the mutation config so `__contract__` (real-catalog) tests are
  // excluded — the mutation score must reflect the fixture-backed unit +
  // integration tests, not real-data smoke (UNN-363).
  vitest: { configFile: "vitest.mutation.config.ts" },
}
