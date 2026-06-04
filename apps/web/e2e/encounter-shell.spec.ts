import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  ENCOUNTER_CAMPAIGN_MANAGE_URL,
  encounterTarget,
  resetEncounterFixtures,
} from "./fixtures/encounter-target"

/**
 * E2E for the encounter setup shell (UNN-335/298/300/302): the create action,
 * the `/combat/{shortId}` status fork, importing placed PCs (298), per-combatant
 * side assignment (300), and save / resume + the single-live-encounter guard
 * (302), **plus the live console's turn-flow spine (UNN-344)** — drafting, End
 * turn, the end-of-turn modal handoff, and round rollover. The turn-flow tests
 * live here (not a separate file) because they mutate the one shared `live`
 * encounter, and this file already serializes + resets it per test.
 *
 * Signed in as the dev user (DM of both seeded campaigns). **Serial** because the
 * tests share campaign-level live-encounter state (the single-live guard); each
 * `beforeEach` resets the seeded encounters and clears any encounter the
 * create-flow test minted.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

test.beforeEach(async () => {
  await resetEncounterFixtures()
})

const PLACED_PC_NAME = encounterTarget.placedPc.seed.name

test("create → import a placed PC → Start → live console", async ({ page }) => {
  // Campaign A has no live encounter, so a new draft created here can be started.
  await page.goto(ENCOUNTER_CAMPAIGN_MANAGE_URL)
  await page.getByRole("button", { name: "New encounter" }).click()
  await page.getByLabel("Name").fill("Bridge ambush")
  await page.getByRole("button", { name: "Create encounter" }).click()

  await expect(page).toHaveURL(/\/combat\/[^/]+$/)
  const start = page.getByRole("button", { name: "Start combat" })
  await expect(start).toBeDisabled()

  // The import panel lists the campaign's placed PC; adding it fills the roster.
  await expect(page.getByText(PLACED_PC_NAME)).toBeVisible()
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(start).toBeEnabled()

  await start.click()
  await expect(
    page.getByTestId("combat-console-battlefield-placeholder")
  ).toBeVisible()
})

test("import panel toggles a placed PC in and out of the roster", async ({
  page,
}) => {
  // The seeded Campaign-A draft already carries the placed PC.
  await page.goto(encounterTarget.draft.url)
  await expect(
    page.getByRole("heading", { name: "Combatants (1)" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Added", exact: true })
  ).toBeVisible()

  // Toggling the added PC removes it; re-toggling adds it back (never twice).
  await page.getByRole("button", { name: "Added", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Combatants (0)" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Combatants (1)" })
  ).toBeVisible()
})

test("assigns a side and persists it across reload (save / resume)", async ({
  page,
}) => {
  await page.goto(encounterTarget.draft.url)
  // The seeded PC defaults to the Players side.
  const enemiesToggle = page.getByRole("button", { name: "Enemies" })
  await expect(enemiesToggle).toHaveAttribute("aria-pressed", "false")

  await enemiesToggle.click()
  await expect(enemiesToggle).toHaveAttribute("aria-pressed", "true")

  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Draft saved.")).toBeVisible()

  await page.reload()
  await expect(page.getByRole("button", { name: "Enemies" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
})

test("single-live guard blocks starting a second encounter", async ({
  page,
}) => {
  // Campaign B already has a live encounter; its draft must not start.
  await page.goto(encounterTarget.blocked.url)
  const start = page.getByRole("button", { name: "Start combat" })
  await expect(start).toBeEnabled()

  await start.click()
  await expect(page.getByText("already has a live encounter")).toBeVisible()
  await expect(
    page.getByTestId("combat-console-battlefield-placeholder")
  ).toBeHidden()
})

test("live encounter renders the console", async ({ page }) => {
  await page.goto(encounterTarget.live.url)
  await expect(
    page.getByTestId("combat-console-battlefield-placeholder")
  ).toBeVisible()
})

test("live console: draft → end turn → modal → hand off to the other side", async ({
  page,
}) => {
  // The seeded live encounter opens un-drafted (neutral start, players lead),
  // with Roan Vale (PC) vs a goblin + a cave bat.
  await page.goto(encounterTarget.live.url)
  await expect(page.getByText("Neutral start")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()

  // Draft the lone player → their turn begins.
  await page.getByRole("button", { name: "Draft Roan Vale" }).click()
  await expect(
    page.getByRole("heading", { name: "Now acting: Roan Vale" })
  ).toBeVisible()

  // End turn always opens the end-of-turn modal (even with nothing to resolve).
  await page.getByRole("button", { name: "End turn" }).click()
  await expect(
    page.getByRole("dialog", { name: "End of Roan Vale's turn" })
  ).toBeVisible()

  // "Done" hands off to the enemies' draft; both enemies are now tappable.
  await page.getByRole("button", { name: "Done — open the draft" }).click()
  await expect(
    page.getByRole("heading", { name: "Enemies' draft" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Draft Goblin" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Draft Cave Bat" })
  ).toBeVisible()
})

test("live console: a full round of turns offers the next round", async ({
  page,
}) => {
  await page.goto(encounterTarget.live.url)

  // Drive all three combatants through draft → end turn → done.
  for (const name of ["Roan Vale", "Goblin", "Cave Bat"]) {
    await page.getByRole("button", { name: `Draft ${name}` }).click()
    await page.getByRole("button", { name: "End turn" }).click()
    await page.getByRole("button", { name: "Done — open the draft" }).click()
  }

  // Everyone has acted → the strip offers the next round.
  const startRound = page.getByRole("button", {
    name: "Round complete — start round 2",
  })
  await expect(startRound).toBeVisible()

  await startRound.click()
  await expect(page.getByText("Round 2")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Draft Roan Vale" })
  ).toBeVisible()
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
