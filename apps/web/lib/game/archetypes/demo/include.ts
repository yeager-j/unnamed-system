/**
 * Whether demo-only Archetypes (the higher-tier Lineage trees authored for
 * testing the Lineage Atlas, UNN-239) are merged into the runtime catalog.
 *
 * The shipped catalog only carries the four Initiate Archetypes; the full
 * branching trees the Atlas is designed around don't exist yet. Demo trees let
 * us exercise tier columns, prerequisite lock-state, and connection lines
 * without shipping unfinished game data to players.
 *
 * Gated on `NEXT_PUBLIC_INCLUDE_DEMO_ARCHETYPES` (not `NODE_ENV`): the archetype
 * registry runs inside client bundles, so the flag must be a `NEXT_PUBLIC_*`
 * value the bundler can inline, and Vercel Preview builds run as `production`
 * — `NODE_ENV` can't tell Preview (where E2E needs the demo tree) from real
 * Production (where it must never appear). Set it to `"true"` in local `.env`
 * and the Vercel **Preview** environment; leave it unset in **Production**.
 */
export const INCLUDE_DEMO_ARCHETYPES =
  process.env.NEXT_PUBLIC_INCLUDE_DEMO_ARCHETYPES === "true"
