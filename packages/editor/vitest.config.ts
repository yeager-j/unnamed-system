import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/**
 * Mirrors upstream's `vitest.config.ts`. The vendored suites self-import via
 * the published specifier `@atomic-editor/editor`; alias it to the source so the
 * tests read exactly as a consumer's would. Kept at the package root (not inside
 * the pristine `src/` tree) — see UPSTREAM.md.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@atomic-editor\/editor$/,
        replacement: `${import.meta.dirname}/src/index.ts`,
      },
      {
        find: /^@atomic-editor\/editor\/code-languages$/,
        replacement: `${import.meta.dirname}/src/code-languages.ts`,
      },
    ],
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/__tests__/setup.ts"],
    globals: false,
  },
})
