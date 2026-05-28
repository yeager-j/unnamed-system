import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  getLevelingTargetState,
  levelingTarget,
  resetLevelingTarget,
  setLevelingTargetVictories,
} from "./fixtures/leveling-target"

/**
 * UNN-157: owner-mode Victories ± popover and the Level-up dialog. Tests
 * exercise the persisted progression state (level, victories, saved
 * Archetype Ranks) and the cross-class write that bumps both progression +
 * vitals on confirm. All tests target the dedicated `levelingTarget` row so
 * the header-actions / cast / write specs can race with these freely.
 */

const CHARACTER_URL = levelingTarget.url

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

test.describe("Leveling controls gating", () => {
  test("signed-out viewer sees Victories x/7 line but no controls", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await resetLevelingTarget()
      await setLevelingTargetVictories(7)
      await page.goto(CHARACTER_URL)

      await expect(
        page.getByRole("heading", { name: levelingTarget.seed.name })
      ).toBeVisible()
      await expect(page.getByText("Victories 7/7")).toBeVisible()
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
    await resetLevelingTarget()
  })

  test("Victory (+1) and Heroic Victory (+2) award and persist", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)

    await awardFromVictoriesPopover(page, "Victory (+1)")
    await expect
      .poll(async () => (await getLevelingTargetState()).victories)
      .toBe(1)

    await awardFromVictoriesPopover(page, "Heroic Victory (+2)")
    await expect
      .poll(async () => (await getLevelingTargetState()).victories)
      .toBe(3)

    await expect(page.getByText("Victories 3/7")).toBeVisible()
  })

  test("Undo (−1) decrements and disables at 0", async ({ page }) => {
    await setLevelingTargetVictories(1)
    await page.goto(CHARACTER_URL)

    await awardFromVictoriesPopover(page, "Undo (−1)")
    await expect
      .poll(async () => (await getLevelingTargetState()).victories)
      .toBe(0)

    await page.getByRole("button", { name: "Victories", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "Undo (−1)", exact: true })
    ).toBeDisabled()
  })

  test("Level up CTA appears only at Victories ≥ 7", async ({ page }) => {
    await setLevelingTargetVictories(6)
    await page.goto(CHARACTER_URL)
    await expect(
      page.getByRole("button", { name: "Level up", exact: true })
    ).toHaveCount(0)

    await setLevelingTargetVictories(7)
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Level up", exact: true })
    ).toBeVisible()
  })

  test("Confirm level-up bumps level, banks +2 Ranks, refills Dice, carries overflow", async ({
    page,
  }) => {
    await setLevelingTargetVictories(10)
    await page.goto(CHARACTER_URL)

    await page.getByRole("button", { name: "Level up", exact: true }).click()
    await page
      .getByRole("button", { name: "Confirm level-up", exact: true })
      .click()
    await expect
      .poll(async () => (await getLevelingTargetState()).level)
      .toBe(2)

    const after = await getLevelingTargetState()
    expect(after.victories).toBe(3)
    expect(after.savedArchetypeRanks).toBe(2)
    expect(after.hitDiceRemaining).toBe(3)
    expect(after.skillDiceRemaining).toBe(7)

    await expect(
      page.getByText("Level 2 · Warrior · Victories 3/7")
    ).toBeVisible()
  })
})
