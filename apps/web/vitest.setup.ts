import fc from "fast-check"

/**
 * Global fast-check configuration, mirroring `packages/game-v2/vitest.setup.ts`.
 * The app hosts the **isomorphism** law because the entity Writers live here.
 *
 * ```bash
 * FC_SEED=1234567890 npm run test -w apps/web   # replay a failure
 * FC_NUM_RUNS=1000 npm run test -w apps/web     # deepen the search
 * ```
 */
fc.configureGlobal({
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  seed: process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined,
  verbose: fc.VerbosityLevel.Verbose,
})
