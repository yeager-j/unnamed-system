import { archetypeSwitchTarget } from "./archetype-switch-target"
import { atlasTarget } from "./atlas-target"
import { castTarget } from "./cast-target"
import { combatStateTarget } from "./combat-state-target"
import { deleteTarget } from "./delete-target"
import { headerActionsTarget } from "./header-actions-target"
import { inheritanceSlotsTarget } from "./inheritance-slots-target"
import { inventoryTarget } from "./inventory-target"
import { levelingTarget } from "./leveling-target"
import { pathOfDawnTarget } from "./path-of-dawn-target"
import { perfectionTarget } from "./perfection-target"
import { ranksBannerTarget } from "./ranks-banner-target"
import { restTarget } from "./rest-target"
import { stainsTarget } from "./stains-target"
import type { E2EFixture } from "./types"
import { valorTarget } from "./valor-target"
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
  archetypeSwitchTarget,
  atlasTarget,
  castTarget,
  headerActionsTarget,
  restTarget,
  levelingTarget,
  combatStateTarget,
  valorTarget,
  perfectionTarget,
  stainsTarget,
  pathOfDawnTarget,
  inventoryTarget,
  inheritanceSlotsTarget,
  ranksBannerTarget,
]

export { archetypeSwitchTarget } from "./archetype-switch-target"
export { atlasTarget } from "./atlas-target"
export { castTarget } from "./cast-target"
export { combatStateTarget } from "./combat-state-target"
export { deleteTarget } from "./delete-target"
export { headerActionsTarget } from "./header-actions-target"
export { inheritanceSlotsTarget } from "./inheritance-slots-target"
export { inventoryTarget } from "./inventory-target"
export { levelingTarget } from "./leveling-target"
export { perfectionTarget } from "./perfection-target"
export { pathOfDawnTarget } from "./path-of-dawn-target"
export { ranksBannerTarget } from "./ranks-banner-target"
export { restTarget } from "./rest-target"
export { stainsTarget } from "./stains-target"
export type { E2EFixture } from "./types"
export { valorTarget } from "./valor-target"
export { writeTarget } from "./write-target"
