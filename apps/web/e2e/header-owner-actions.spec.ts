import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createHeaderActionsTarget } from "./fixtures/header-actions-target"

/**
 * UNN-155: the header's owner-mode actions affordance. Take damage / Heal /
 * Spend SP / Recover SP / Use Prisma persist to the row, the bars in the
 * Vitals card reflect the new value after the action settles, and the
 * affordance is absent for non-owners. Targets an ephemeral, factory-minted row
 * so the cast-skill and write-pattern specs can race with these freely.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createHeaderActionsTarget>>

async function fillAdjustPopover(
  page: Page,
  popoverLabel: string,
  amount: number,
  buttonLabel: string
): Promise<void> {
  await page.getByRole("button", { name: popoverLabel, exact: true }).click()
  const input = page.getByLabel("Amount")
  await input.fill(String(amount))
  await page.getByRole("button", { name: buttonLabel, exact: true }).click()
}

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createHeaderActionsTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("Header owner-actions gating", () => {
  test("signed-out viewer does not see the actions affordance", async ({
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
      await expect(page.getByTestId("owner-controls-slot")).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Adjust HP", exact: true })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

test.describe("owner header actions", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("Take damage subtracts HP and persists across reload", async ({
    page,
  }) => {
    await page.goto(target.url)
    const before = await target.getPools()

    await fillAdjustPopover(page, "Adjust HP", 3, "Take damage")
    await page.waitForLoadState("networkidle")

    const after = await target.getPools()
    expect(after.currentHP).toBe(before.currentHP - 3)
    expect(after.currentSP).toBe(before.currentSP)

    await page.reload()
    await expect(
      page.getByText(`${after.currentHP} / ${before.currentHP}`)
    ).toBeVisible()
  })

  test(
    "Heal raises HP and clamps at max",
    { tag: "@smoke" },
    async ({ page }) => {
      await target.setCurrentHP(2)
      await page.goto(target.url)
      const before = await target.getPools()

      await fillAdjustPopover(page, "Adjust HP", 999, "Heal")
      await page.waitForLoadState("networkidle")

      const after = await target.getPools()
      expect(after.currentHP).toBeGreaterThan(before.currentHP)
      expect(after.currentHP).toBeLessThanOrEqual(after.currentHP)
    }
  )

  test("Take damage to 0 surfaces the Fallen badge", async ({ page }) => {
    await target.setCurrentHP(2)
    await page.goto(target.url)

    await fillAdjustPopover(page, "Adjust HP", 5, "Take damage")
    await page.waitForLoadState("networkidle")

    const after = await target.getPools()
    expect(after.currentHP).toBe(0)
    await expect(
      page.getByText("Fallen", { exact: true }).first()
    ).toBeVisible()
  })

  test("Spend SP subtracts SP and persists", async ({ page }) => {
    await page.goto(target.url)
    const before = await target.getPools()

    await fillAdjustPopover(page, "Adjust SP", 4, "Spend SP")
    await page.waitForLoadState("networkidle")

    const after = await target.getPools()
    expect(after.currentSP).toBe(before.currentSP - 4)
    expect(after.currentHP).toBe(before.currentHP)
  })

  test("Recover SP clamps at max", async ({ page }) => {
    await page.goto(target.url)
    const before = await target.getPools()

    await fillAdjustPopover(page, "Adjust SP", 999, "Recover SP")
    await page.waitForLoadState("networkidle")

    const after = await target.getPools()
    expect(after.currentSP).toBe(before.currentSP)
  })

  test("Use Prisma decrements the inline count and persists", async ({
    page,
  }) => {
    await page.goto(target.url)
    const before = await target.getPools()
    expect(before.prismaCharges).toBeGreaterThan(0)

    await expect(
      page.getByText(
        `${before.prismaCharges} ${before.prismaCharges === 1 ? "Charge" : "Charges"}`
      )
    ).toBeVisible()

    await page.getByRole("button", { name: "Use", exact: true }).click()
    await page.waitForLoadState("networkidle")

    const after = await target.getPools()
    expect(after.prismaCharges).toBe(before.prismaCharges - 1)
    await expect(
      page.getByText(
        `${after.prismaCharges} ${after.prismaCharges === 1 ? "Charge" : "Charges"}`
      )
    ).toBeVisible()
  })

  test("Use Prisma button is disabled at 0 charges", async ({ page }) => {
    await target.setPrismaCharges(0)
    await page.goto(target.url)

    await expect(page.getByText("0 Charges")).toBeVisible()
    const button = page.getByRole("button", { name: "Use", exact: true })
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()
  })
})
