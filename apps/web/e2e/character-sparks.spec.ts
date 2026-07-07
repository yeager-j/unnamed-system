import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createSparkTarget } from "./fixtures/spark-target"

/**
 * UNN-558: the Explore tab's Spark loop + Talent learning. One target minted
 * at 6/7 Sparks (Expression absent from the log) drives the AC:
 *
 *  1. Add Spark fills the log to 7/7; the card's action swaps to Rank Up.
 *  2. The forced rank-up dialog lists **eligible** Virtues only (in the log).
 *  3. Ranking up bumps the Virtue and clears the log — optimistic + persisted.
 *  4. Add Talent / Remove Talent round-trips through the per-entry descriptors.
 *
 * **Serial**: both tests mutate the one target, in log-state order.
 */
test.describe.configure({ mode: "serial" })
test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createSparkTarget>>

test.beforeAll(async () => {
  target = await createSparkTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function openExplore(page: Page) {
  await page.goto(target.url)
  await page.getByRole("tab", { name: "Explore" }).click()
  await expect(page.getByRole("region", { name: "Virtues" })).toBeVisible()
}

test("7th Spark forces rank-up of an eligible Virtue only; log clears", async ({
  page,
}) => {
  await openExplore(page)
  const virtues = page.getByRole("region", { name: "Virtues" })
  await expect(virtues).toContainText("Sparks · 6 / 7")

  // The 7th Spark — tagged Wisdom via the picker popover.
  await virtues.getByRole("button", { name: "Add Spark" }).click()
  await page.getByRole("button", { name: "Wisdom", exact: true }).click()
  await expect(virtues).toContainText("Sparks · 7 / 7")
  await expect
    .poll(async () => (await target.getVirtues())?.sparkLog.length)
    .toBe(7)

  // The forced flow: Add Spark is gone, Rank Up is the action.
  const addSpark = await virtues
    .getByRole("button", { name: "Add Spark" })
    .count()
  expect(addSpark).toBe(0)
  await virtues.getByRole("button", { name: "Rank Up a Virtue" }).click()

  // Eligibility: only logged Virtues are offered — Expression never earned one.
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("button", { name: "Wisdom" })).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Empathy" })).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Focus" })).toBeVisible()
  const expression = await dialog
    .getByRole("button", { name: "Expression" })
    .count()
  expect(expression).toBe(0)

  // Rank up Wisdom: 2 → 3 optimistically, log empties, action swaps back.
  await dialog.getByRole("button", { name: "Wisdom" }).click()
  await expect(virtues).toContainText("Sparks · 0 / 7")
  await expect(
    virtues.getByRole("meter", { name: "Wisdom rank" })
  ).toHaveAttribute("aria-valuenow", "3")
  await expect(virtues.getByRole("button", { name: "Add Spark" })).toBeVisible()

  await expect
    .poll(async () => (await target.getVirtues())?.ranks.wisdom)
    .toBe(3)
  expect((await target.getVirtues())?.sparkLog).toEqual([])
})

test("Add Talent and Remove Talent persist per-entry", async ({ page }) => {
  await openExplore(page)
  const talents = page.getByRole("region", { name: "Talents" })

  await talents.getByRole("button", { name: "Add Talent" }).click()
  await page.getByPlaceholder("Search Talents…").fill("Cook")
  await page.getByRole("option", { name: "Cook" }).click()

  await expect(talents).toContainText("Cook")
  await expect.poll(() => target.getTalentKeys()).toContain("cook")

  await talents.getByRole("button", { name: "Remove Cook" }).click()
  await expect(talents).not.toContainText("Cook")
  await expect.poll(() => target.getTalentKeys()).not.toContain("cook")
})
