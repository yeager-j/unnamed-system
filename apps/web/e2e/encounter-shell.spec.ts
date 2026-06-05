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

  // "Start combat" opens the advantage dialog; confirming (default Neutral) starts.
  await start.click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start combat" })
    .click()
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start combat" })
    .click()
  await expect(page.getByText("already has a live encounter")).toBeVisible()
  await expect(
    page.getByTestId("combat-console-battlefield-placeholder")
  ).toBeHidden()
})

test("start dialog: a Players ambush opens the live console with a Player-start badge (UNN-303)", async ({
  page,
}) => {
  // Campaign A's seeded draft has no live encounter, so it can be started; the
  // chosen advantage surfaces as the live header badge + the opening draft side.
  await page.goto(encounterTarget.draft.url)
  await page.getByRole("button", { name: "Start combat" }).click()

  const dialog = page.getByRole("dialog")
  await dialog.getByText("Players ambush").click()
  await dialog.getByRole("button", { name: "Start combat" }).click()

  await expect(page.getByText("Player start")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()
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

test("rail row opens the PC detail drawer (UNN-345)", async ({ page }) => {
  await page.goto(encounterTarget.live.url)
  await expect(page.getByText("Players · 1")).toBeVisible()
  await expect(page.getByText("Enemies · 2")).toBeVisible()

  await page.getByRole("button", { name: "Open Roan Vale detail" }).click()
  const drawer = page.getByRole("dialog")
  await expect(drawer.getByText("Attributes")).toBeVisible()
  await expect(drawer.getByText("Affinities")).toBeVisible()
  // PC footer: edits flow to the character sheet (read-only container here).
  await expect(
    drawer.getByText(/character sheet — the player sees it live/)
  ).toBeVisible()
})

test("rail row opens an enemy detail drawer (UNN-345)", async ({ page }) => {
  await page.goto(encounterTarget.live.url)

  // Cave Bat is an inline stat block: no SP, no affinity chart, encounter-scoped.
  await page.getByRole("button", { name: "Open Cave Bat detail" }).click()
  const drawer = page.getByRole("dialog")
  await expect(drawer.getByText("No affinity data.")).toBeVisible()
  await expect(
    drawer.getByText(/Edits affect this enemy in this encounter only/)
  ).toBeVisible()
})

test("enemy HP adjust drives the bar down to a Dead badge (UNN-309)", async ({
  page,
}) => {
  // Enemy vitals live on the session blob, which `resetEncounterFixtures`
  // restores per test — so this is self-cleaning and won't perturb the
  // (serial) turn-flow tests. PC HP is the character row and is NOT reset, so
  // there is deliberately no PC-vitals e2e here.
  await page.goto(encounterTarget.live.url)
  const caveBat = page.getByRole("button", { name: "Open Cave Bat detail" })
  await expect(caveBat).toContainText("8/8")

  await caveBat.click()
  const drawer = page.getByRole("dialog")
  await drawer.getByRole("button", { name: "Adjust HP", exact: true }).click()
  await page.getByLabel("Amount").fill("9")
  await page.getByRole("button", { name: "Take damage" }).click()

  // 8 − 9 floors at 0 → Dead. Asserted inside the drawer: it is a modal sheet,
  // so the rail behind it is inert while open.
  await expect(drawer.getByText("Dead")).toBeVisible()
  await expect(drawer.getByText("0 / 8")).toBeVisible()
})

test("catalog enemy HP is adjustable on its working ref (UNN-309)", async ({
  page,
}) => {
  // The goblin is a catalog enemy: its working HP lives inline on the ref,
  // defaulting to the definition's max — so its controls are live (they used to
  // be disabled for lack of a working-HP field).
  await page.goto(encounterTarget.live.url)
  await page.getByRole("button", { name: "Open Goblin detail" }).click()
  const drawer = page.getByRole("dialog")

  const adjustHp = drawer.getByRole("button", {
    name: "Adjust HP",
    exact: true,
  })
  await expect(adjustHp).toBeEnabled()
  await adjustHp.click()
  await page.getByLabel("Amount").fill("1")
  await page.getByRole("button", { name: "Take damage" }).click()

  // 16 → 15 reads off the ref's working HP (no longer the full-bar fallback).
  await expect(drawer.getByText("15 / 16")).toBeVisible()
})

test("drawer edits session-overlay ailments + action economy (UNN-310)", async ({
  page,
}) => {
  // Ailments / action economy live on the session blob, which
  // `resetEncounterFixtures` restores per test — self-cleaning, so this won't
  // perturb the (serial) turn-flow tests.
  await page.goto(encounterTarget.live.url)
  await page.getByRole("button", { name: "Open Goblin detail" }).click()
  const drawer = page.getByRole("dialog")

  // Action economy: Reaction toggles from available to used.
  await drawer.getByRole("button", { name: "Reaction available" }).click()
  await expect(
    drawer.getByRole("button", { name: "Reaction used" })
  ).toBeVisible()

  // Ailments are a permissive multi-select: setting Burn marks its toggle
  // pressed (the picker portals out of the modal sheet, so scope to the page;
  // match the row by its description so it never collides with the trigger
  // summary, which also reads "Burn" once set).
  await drawer.getByRole("button", { name: "No ailment" }).click()
  const burnToggle = page.getByRole("button", { name: /Burn.*max HP/ })
  await burnToggle.click()
  await expect(burnToggle).toHaveAttribute("aria-pressed", "true")
})

test("End encounter flips the live console to the ended stub (UNN-320)", async ({
  page,
}) => {
  // Status lives on the encounter row, which `resetEncounterFixtures` restores
  // per test — so ending the shared live encounter here is self-cleaning.
  await page.goto(encounterTarget.live.url)
  await expect(
    page.getByTestId("combat-console-battlefield-placeholder")
  ).toBeVisible()

  await page.getByRole("button", { name: "End encounter" }).click()
  const confirm = page.getByRole("alertdialog")
  await expect(
    confirm.getByRole("heading", { name: "End this encounter?" })
  ).toBeVisible()
  await confirm.getByRole("button", { name: "End encounter" }).click()

  await expect(page.getByTestId("combat-ended-stub")).toBeVisible()
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
