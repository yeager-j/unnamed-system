import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  ENCOUNTER_CAMPAIGNS_URL,
  encounterTarget,
  resetEncounterFixtures,
} from "./fixtures/encounter-target"

/**
 * Walking-skeleton E2E for the encounter shell (UNN-335): the create action,
 * the `/combat/{shortId}` status fork (draft → setup, live → console, ended →
 * read-only), and the Start-combat draft→live transition. The setup panels and
 * the console body are stubs (their own downstream tickets), so this asserts the
 * *frame and the routing*, not the rich setup/console flows.
 *
 * Signed in as the dev user, who is the DM of the seeded campaign. `beforeEach`
 * resets the seeded encounters' statuses so a prior run's Start transition (or a
 * previous test in this file) doesn't poison the next.
 */
test.use({ storageState: STORAGE_STATE })

test.beforeEach(async () => {
  await resetEncounterFixtures()
})

test("create → setup shell → add combatant → Start → live console", async ({
  page,
}) => {
  await page.goto(ENCOUNTER_CAMPAIGNS_URL)
  await page.getByRole("button", { name: "New encounter" }).click()

  await expect(page).toHaveURL(/\/combat\/[^/]+$/)
  await expect(page.getByRole("button", { name: "Start combat" })).toBeVisible()

  // A freshly-created encounter has no combatants, so Start is disabled until
  // the stub panel adds one.
  const start = page.getByRole("button", { name: "Start combat" })
  await expect(start).toBeDisabled()

  await page.getByRole("button", { name: "Add placeholder combatant" }).click()
  await expect(start).toBeEnabled()

  await start.click()
  await expect(page.getByTestId("combat-console-stub")).toBeVisible()
})

test("seeded draft enables Start on load and transitions to live", async ({
  page,
}) => {
  await page.goto(encounterTarget.draft.url)

  const start = page.getByRole("button", { name: "Start combat" })
  await expect(start).toBeEnabled()

  await start.click()
  await expect(page.getByTestId("combat-console-stub")).toBeVisible()
})

test("live encounter renders the console stub", async ({ page }) => {
  await page.goto(encounterTarget.live.url)
  await expect(page.getByTestId("combat-console-stub")).toBeVisible()
})

test("ended encounter renders the read-only ended stub", async ({ page }) => {
  await page.goto(encounterTarget.ended.url)
  await expect(page.getByTestId("combat-ended-stub")).toBeVisible()
})

test("404s for an unknown encounter", async ({ page }) => {
  const response = await page.goto("/combat/does-not-exist")
  expect(response?.status()).toBe(404)
})

test("404s for an encounter in another DM's campaign", async ({ page }) => {
  const response = await page.goto(encounterTarget.foreign.url)
  expect(response?.status()).toBe(404)
})
