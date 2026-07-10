import fc from "fast-check"

/**
 * Global fast-check configuration for the engine's **law** suites
 * (`**\/__laws__/*.laws.test.ts`).
 *
 * The seed is **random by default** — that is the entire point of property-based
 * testing. A pinned seed would turn each law into a slow example test that stops
 * discovering inputs after its first green run. On failure fast-check prints the
 * seed and the shrink path; `FC_SEED` replays that run exactly.
 *
 * ```bash
 * FC_SEED=1234567890 npm run test -w packages/game-v2   # replay a failure
 * FC_NUM_RUNS=1000 npm run test -w packages/game-v2     # deepen the search
 * ```
 */
fc.configureGlobal({
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  seed: process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined,
  verbose: fc.VerbosityLevel.Verbose,
})
