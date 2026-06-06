// @ts-check

/**
 * Mutation testing for the pure engine layer (UNN-351). Scoped to `src/engine`
 * — `data`/`foundation` are authored truth, not mutation targets. Off the PR
 * critical path (a full run is far slower than the ~1s suite); run manually or
 * nightly, and scope `mutate` to changed engine files when iterating.
 *
 * Inert until the lib/game move populates `src/engine/**` (docs/engine-reorg).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  coverageAnalysis: "off",
  mutate: ["src/engine/**/*.ts", "!src/engine/**/*.test.ts"],
  reporters: ["html", "json", "clear-text", "progress"],
  vitest: { configFile: "vitest.config.ts" },
}
