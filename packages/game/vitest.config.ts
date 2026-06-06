import { defineConfig } from "vitest/config"

export default defineConfig({
  // Mirror the tsconfig `@workspace/game/*` path alias so any test that imports
  // through the package name (rather than a relative path) resolves.
  resolve: {
    alias: {
      "@workspace/game": `${import.meta.dirname}/src`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      // Gap-finder for the engine layer only (UNN-351): pure data/foundation are
      // authored truth, not mutation/coverage targets. Branch coverage, no
      // thresholds — read the uncovered-branch list, ignore the %.
      provider: "v8",
      reporter: ["text-summary", "html", "json"],
      include: ["src/engine/**/*.ts"],
      exclude: ["**/*.test.ts", "src/**/__fixtures__/**"],
    },
  },
})
