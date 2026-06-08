import { configDefaults, defineConfig, mergeConfig } from "vitest/config"

import baseConfig from "./vitest.config"

/**
 * Vitest config for the Stryker mutation run (UNN-363). Identical to the base
 * config except it **excludes `__contract__`** so the mutation score reflects
 * the *fixture-backed* unit + integration tests only. Contract tests assert
 * against the real shipped catalog; letting one "kill" a mutant would mask a
 * gap in the fixture tests — the opposite of the test-signal goal. Referenced by
 * `stryker.conf.mjs`'s `vitest.configFile`; the default `npm run test` still
 * runs every suite.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "**/__contract__/**"],
    },
  })
)
