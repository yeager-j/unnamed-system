import { defineConfig } from "vitest/config"

export default defineConfig({
  // Mirror the tsconfig `@workspace/game-v2/*` path alias so any test that imports
  // through the package name (rather than a relative path) resolves.
  resolve: {
    alias: {
      "@workspace/game-v2": `${import.meta.dirname}/src`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      // Gap-finder for the logic layer (UNN-499/D33): `*.schema.ts` are pure
      // authored shapes, `catalog/` is authored data, `composition.ts` is wiring —
      // none are mutation/coverage targets. Branch coverage, no thresholds: read
      // the uncovered-branch list, ignore the %.
      provider: "v8",
      reporter: ["text-summary", "html", "json"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "src/**/*.schema.ts",
        "src/catalog/**",
        "src/**/__fixtures__/**",
        "src/composition.ts",
      ],
    },
  },
})
