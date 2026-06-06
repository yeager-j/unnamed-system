import { defineConfig } from "vitest/config"

export default defineConfig({
  // Mirror the tsconfig `@/*` path alias so runtime (value) imports through it
  // resolve in tests — previously only type-only `@/` imports appeared in
  // tested modules, and those are erased before resolution.
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
  test: {
    // Default is `node`. Tests that need DOM (e.g. React hook tests under
    // `hooks/`) opt in via `// @vitest-environment jsdom` at the top of the
    // file — `environmentMatchGlobs` was removed in Vitest 4.
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      // Coverage here is a GAP-FINDER for the pure game engine, not a quality
      // gate (UNN-351). It answers "which rules has no test ever run?" — so it
      // is scoped to `lib/game/**` (where almost every branch is a rule), reads
      // as branch coverage, and sets NO thresholds. A repo-wide % would be
      // meaningless (React, server actions); a quota would invite low-value
      // line-touching tests. Read the uncovered-*branch* list, ignore the %.
      provider: "v8",
      // `text-summary` keeps the terminal to one block (the hundreds of pure
      // data-catalog files would flood a per-file `text` table); the browsable
      // `html` report under coverage/ is the actual gap-list UI; `json` is for
      // programmatic triage.
      reporter: ["text-summary", "html", "json"],
      // Scoping to `include` also surfaces rule modules no test imports at all
      // (Vitest 4 reports every matched file, covered or not) — an entirely
      // untested file is the loudest gap.
      include: ["lib/game/**/*.ts"],
      exclude: ["**/*.test.ts", "lib/game/**/__fixtures__/**"],
    },
  },
})
