import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createRestTarget } from "./fixtures/rest-target"

/**
 * UNN-156: the header-launched Rest dialog. Full / Partial / Respite persist
 * the right pools + dice + exhaustion + prisma per PRD §7.3, the dialog
 * surfaces Hit and Skill Dice remaining, and the trigger is owner-gated.
 * Each spec resets via `target.reset()` so a previous test's mutation doesn't
 * poison the next assertion. Balanced path (HD d10, SD d10) keeps the die-size
 * labels predictable across runs.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createRestTarget>>

async function openRestDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Rest", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Rest" })).toBeVisible()
}

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createRestTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("Rest dialog gating", () => {
  test("signed-out viewer does not see the Rest trigger", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await target.reset()
      await page.goto(target.url)
      await expect(
        page.getByRole("heading", { name: target.name })
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Rest", exact: true })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

test.describe("owner Rest flow", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("dialog surfaces Hit and Skill Dice remaining with the path die", async ({
    page,
  }) => {
    await page.goto(target.url)
    await openRestDialog(page)

    // Balanced path → both dice are d10. reset leaves the row with one spent
    // of each.
    await expect(page.getByText("Hit Dice · d10")).toBeVisible()
    await expect(page.getByText("Skill Dice · d10")).toBeVisible()
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible()
    await expect(page.getByText("3 / 5", { exact: true })).toBeVisible()
  })

  test("Full Rest refills everything", async ({ page }) => {
    await page.goto(target.url)
    await openRestDialog(page)
    await page.getByRole("button", { name: "Take Full Rest" }).click()
    await page.waitForLoadState("networkidle")

    const after = await target.getState()
    expect(after.currentHP).toBeGreaterThan(0)
    expect(after.hitDiceRemaining).toBe(2)
    expect(after.skillDiceRemaining).toBe(5)
    expect(after.exhaustion).toBe(0)
    expect(after.prismaCharges).toBeGreaterThan(0)
  })

  test("Partial Rest restores HP, spends Skill Dice, and adds SP", async ({
    page,
  }) => {
    await page.goto(target.url)
    const before = await target.getState()
    await openRestDialog(page)
    await page.getByRole("tab", { name: "Partial" }).click()

    await page.getByLabel("Skill Dice to spend").fill("2")
    await page.getByLabel("SP recovered").fill("10")
    await page.getByRole("button", { name: "Take Partial Rest" }).click()
    await page.waitForLoadState("networkidle")

    const after = await target.getState()
    // Skill Dice deducted by 2; Hit Dice untouched; SP +10 clamped; HP to max.
    expect(after.skillDiceRemaining).toBe(before.skillDiceRemaining - 2)
    expect(after.hitDiceRemaining).toBe(before.hitDiceRemaining)
    expect(after.currentSP).toBeGreaterThanOrEqual(before.currentSP + 10)
    expect(after.currentHP).toBeGreaterThan(before.currentHP)
    expect(after.exhaustion).toBe(before.exhaustion)
  })

  test("Respite spends Hit Dice and adds HP", async ({ page }) => {
    await page.goto(target.url)
    const before = await target.getState()
    await openRestDialog(page)
    await page.getByRole("tab", { name: "Respite" }).click()

    await page.getByLabel("Hit Dice to spend").fill("1")
    await page.getByLabel("HP recovered").fill("4")
    await page.getByRole("button", { name: "Take Respite" }).click()
    await page.waitForLoadState("networkidle")

    const after = await target.getState()
    // Hit Dice deducted by 1; HP +4 clamped; SP and Skill Dice untouched.
    expect(after.hitDiceRemaining).toBe(before.hitDiceRemaining - 1)
    expect(after.skillDiceRemaining).toBe(before.skillDiceRemaining)
    expect(after.currentHP).toBeGreaterThanOrEqual(before.currentHP + 4)
    expect(after.currentSP).toBe(before.currentSP)
  })

  test("Partial Rest submit is disabled when Skill Dice exceeds unspent", async ({
    page,
  }) => {
    await page.goto(target.url)
    await openRestDialog(page)
    await page.getByRole("tab", { name: "Partial" }).click()

    // reset leaves 3 unspent Skill Dice; 4 should disable Submit.
    await page.getByLabel("Skill Dice to spend").fill("4")
    await expect(
      page.getByRole("button", { name: "Take Partial Rest" })
    ).toBeDisabled()
  })
})
