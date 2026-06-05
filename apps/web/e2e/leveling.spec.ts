import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createLevelingTarget } from "./fixtures/leveling-target"

/**
 * UNN-157: owner-mode Victories ± popover and the Level-up dialog. Tests
 * exercise the persisted progression state (level, victories, saved
 * Archetype Ranks) and the cross-class write that bumps both progression +
 * vitals on confirm. Targets an ephemeral, factory-minted row so the
 * header-actions / cast / write specs can race with these freely.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createLevelingTarget>>

async function awardFromVictoriesPopover(
  page: Page,
  buttonName: string
): Promise<void> {
  const trigger = page.getByRole("button", { name: "Victories", exact: true })
  await trigger.click()
  const action = page.getByRole("button", { name: buttonName, exact: true })
  await action.click()
  await expect(action).toBeHidden()
}

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createLevelingTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("Leveling controls gating", () => {
  test("signed-out viewer sees Victories x/7 line but no controls", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await target.reset()
      await target.setVictories(7)
      await page.goto(target.url)

      await expect(
        page.getByRole("heading", { name: target.name })
      ).toBeVisible()
      await expect(page.getByText("7/7 Victories")).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Victories", exact: false })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Level up", exact: true })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

test.describe("owner leveling controls", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("Victory (+1) and Heroic Victory (+2) award and persist", async ({
    page,
  }) => {
    await page.goto(target.url)

    await awardFromVictoriesPopover(page, "Victory (+1)")
    await expect.poll(async () => (await target.getState()).victories).toBe(1)

    await awardFromVictoriesPopover(page, "Heroic Victory (+2)")
    await expect.poll(async () => (await target.getState()).victories).toBe(3)

    await expect(page.getByText("3/7 Victories")).toBeVisible()
  })

  test("Undo (−1) decrements and disables at 0", async ({ page }) => {
    await target.setVictories(1)
    await page.goto(target.url)

    await awardFromVictoriesPopover(page, "Undo (−1)")
    await expect.poll(async () => (await target.getState()).victories).toBe(0)

    await page.getByRole("button", { name: "Victories", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "Undo (−1)", exact: true })
    ).toBeDisabled()
  })

  test("Level up CTA appears only at Victories ≥ 7", async ({ page }) => {
    await target.setVictories(6)
    await page.goto(target.url)
    await expect(
      page.getByRole("button", { name: "Level up", exact: true })
    ).toHaveCount(0)

    await target.setVictories(7)
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Level up", exact: true })
    ).toBeVisible()
  })

  test("Confirm level-up bumps level, banks +2 Ranks, refills Dice, carries overflow", async ({
    page,
  }) => {
    await target.setVictories(10)
    await page.goto(target.url)

    await page.getByRole("button", { name: "Level up", exact: true }).click()
    await page
      .getByRole("button", { name: "Confirm level-up", exact: true })
      .click()
    await expect.poll(async () => (await target.getState()).level).toBe(2)

    const after = await target.getState()
    expect(after.victories).toBe(3)
    expect(after.savedArchetypeRanks).toBe(2)
    expect(after.hitDiceRemaining).toBe(3)
    expect(after.skillDiceRemaining).toBe(7)

    await expect(page.getByText(/Level 2 · Warrior/)).toBeVisible()
    await expect(page.getByText("3/7 Victories")).toBeVisible()
  })
})
