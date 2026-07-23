import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { createDungeonCombatTarget } from "./fixtures/dungeon-combat-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * E2E for the delve player watch's phase transitions (UNN-603 / UNN-604). Two
 * pages in one context: the dev user drives the DM console while the watch page
 * sits open on the same delve. Starting combat must swap the watch from the
 * exploration fog map to the combat battlefield — the **same map**, now carrying
 * the fight's redacted combatants — and ending it must swap back, both **without
 * a page reload** (asserted via a `window` marker that any full navigation would
 * wipe). Runs on the degraded polling path (CI has no `ABLY_API_KEY`), the
 * harder of the two transports.
 *
 * `bringToFront` matters: the watch's poll suspends while its tab is hidden
 * (visibility-aware), so each phase assertion first foregrounds the watch page.
 *
 * **Serial** (the one test mutates the shared delve); `afterAll` tears the world
 * down — the factory sweeps the app-created encounter off the tracked Instance.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createDungeonCombatTarget>>

test.beforeAll(async () => {
  target = await createDungeonCombatTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

/** The reload canary: `router.refresh()` keeps the JS realm, a navigation wipes it. */
async function setNoReloadMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as { __unnWatchMarker?: boolean }).__unnWatchMarker = true
  })
}

async function hasNoReloadMarker(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as { __unnWatchMarker?: boolean }).__unnWatchMarker === true
  )
}

test("the signed-out watch catches up through degraded polling with redaction intact", async ({
  page,
  browser,
}) => {
  const watchContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const watchPage = await watchContext.newPage()
  await watchPage.goto(target.dungeon.watchUrl)

  // Exploration baseline: the fog board (a React Flow canvas) shows the
  // revealed Entry zone with the PC's token standing in it.
  const board = watchPage.locator(".react-flow")
  const entryCard = board.getByLabel(`Zone: ${target.startZone.name}`)
  await expect(entryCard).toBeVisible()
  await expect(entryCard.getByText(target.pc.name)).toBeVisible()
  await setNoReloadMarker(watchPage)

  // The DM starts a fight: bestiary staging → queue a Goblin → Begin.
  await page.bringToFront()
  await page.goto(target.dungeon.url)
  await page.getByRole("button", { name: "Start an encounter" }).click()
  await page
    .getByRole("textbox", { name: "Search the bestiary" })
    .fill("Goblin")
  await page
    .getByRole("button", { name: "Queue Goblin", exact: true })
    .first()
    .click()
  await page.getByRole("button", { name: "Begin encounter" }).click()
  await expect.poll(async () => await target.getLiveEncounter()).not.toBeNull()

  // The watch swaps to the combat battlefield without a reload: the round
  // tracker + Combat badge appear, and the board is still the map — the same
  // Entry zone card inside the React Flow canvas, now a combat zone whose
  // pieces include the PC (a PC's participant id is its characterId).
  await watchPage.bringToFront()
  await expect(
    watchPage.getByRole("heading", { name: /^Round \d+$/ })
  ).toBeVisible({ timeout: 20_000 })
  await expect(watchPage.getByText("Combat", { exact: true })).toBeVisible()
  await expect(entryCard).toBeVisible()
  await expect(entryCard.getByText(target.pc.name)).toBeVisible()
  expect(await hasNoReloadMarker(watchPage)).toBe(true)

  // The DM ends the fight (confirming the dialog).
  await page.bringToFront()
  const endButton = page.getByRole("button", { name: "End encounter" })
  await expect(endButton).toBeVisible({ timeout: 20_000 })
  await endButton.click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "End encounter" })
    .click()
  await expect.poll(async () => await target.getLiveEncounter()).toBeNull()

  // The watch swaps back to exploration without a reload: the round tracker
  // leaves, the delve turn counter returns (the end advanced it to 1), and the
  // PC still stands on the fog board where the fight ended.
  await watchPage.bringToFront()
  await expect(
    watchPage.getByRole("heading", { name: /^Round \d+$/ })
  ).toHaveCount(0, { timeout: 20_000 })
  await expect(watchPage.getByText("Turn 1")).toBeVisible({ timeout: 20_000 })
  await expect(entryCard.getByText(target.pc.name)).toBeVisible()
  expect(await hasNoReloadMarker(watchPage)).toBe(true)
  await watchContext.close()
})
