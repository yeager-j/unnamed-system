import fc from "fast-check"

fc.configureGlobal({
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  seed: process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined,
  verbose: fc.VerbosityLevel.Verbose,
})
