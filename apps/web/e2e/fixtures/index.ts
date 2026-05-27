import { castTarget } from "./cast-target"
import { deleteTarget } from "./delete-target"
import type { E2EFixture } from "./types"
import { writeTarget } from "./write-target"

/**
 * Every dedicated E2E-target seed character, owned by the dev user, that
 * `lib/db/seed.ts` should insert before Playwright runs. To add a new
 * write spec: drop a new fixture file in this directory (mirroring the
 * shape of any neighbour), append it to the array below, and import the
 * fixture from your spec for the URL / id / reset helper. Two-step
 * discoverability beats the previous "edit `seed.ts` plus the spec"
 * sprawl (UNN-231).
 */
export const DEV_USER_E2E_FIXTURES: ReadonlyArray<E2EFixture> = [
  writeTarget,
  deleteTarget,
  castTarget,
]

export { castTarget } from "./cast-target"
export { deleteTarget } from "./delete-target"
export type { E2EFixture } from "./types"
export { writeTarget } from "./write-target"
