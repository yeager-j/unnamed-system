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
  },
})
