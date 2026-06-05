import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createInventoryTarget } from "./fixtures/inventory-target"

/**
 * UNN-223: owner-mode Inventory edits — add from the catalog (with stacking
 * and overflow), in-line quantity adjustment, removal (auto-unequipping an
 * equipped item), and currency add / spend. Plus the cross-cutting gating
 * (public sheet shows quantities and currency but none of the controls).
 * Targets an ephemeral, factory-minted row so the other write specs can race
 * with these freely.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createInventoryTarget>>

const inventoryUrl = () => `${target.url}?tab=inventory`

function openRow(page: Page, name: RegExp) {
  return page.getByRole("button", { name }).first().click()
}

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createInventoryTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("Inventory gating", () => {
  test("signed-out viewer sees quantities and currency but no controls", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await target.reset()
      await page.goto(inventoryUrl())
      await expect(
        page.getByRole("heading", { name: target.name })
      ).toBeVisible()

      // Read-only content: the Soul Drop stack count and the currency value
      // (the value renders in both the persistent header and the tab card).
      await expect(page.getByText("× 5", { exact: true })).toBeVisible()
      await expect(
        page.getByText("100 gp", { exact: true }).first()
      ).toBeVisible()

      // Owner controls absent.
      await expect(page.getByRole("button", { name: "Add item" })).toHaveCount(
        0
      )
      await expect(
        page.getByRole("button", { name: "Adjust currency" })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

test.describe("owner Inventory editing", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("adds a non-stackable item as a new row", async ({ page }) => {
    await page.goto(inventoryUrl())

    await page.getByRole("button", { name: "Add item" }).click()
    await page
      .getByRole("listitem")
      .filter({ hasText: "Longsword" })
      .getByRole("button", { name: "Add" })
      .click()
    await page.waitForLoadState("networkidle")

    await expect
      .poll(async () => (await target.getRows("longsword")).length)
      .toBe(2)
  })

  test("adds a stackable item into the existing row", async ({ page }) => {
    await page.goto(inventoryUrl())

    await page.getByRole("button", { name: "Add item" }).click()
    const row = page.getByRole("listitem").filter({ hasText: "Soul Drop" })
    await row.getByRole("spinbutton", { name: "Soul Drop quantity" }).fill("3")
    await row.getByRole("button", { name: "Add" }).click()
    await page.waitForLoadState("networkidle")

    await expect
      .poll(async () => await target.getRows("soul-drop"))
      .toEqual([{ equipped: false, quantity: 8 }])
  })

  test("increments a stack with the in-line adjuster", async ({ page }) => {
    await page.goto(inventoryUrl())

    await openRow(page, /Soul Drop/)
    await page.getByRole("button", { name: "Increase quantity" }).click()
    await page.waitForLoadState("networkidle")

    await expect
      .poll(async () => (await target.getRows("soul-drop"))[0]?.quantity)
      .toBe(6)
  })

  test("setting a stack to 0 removes the row", async ({ page }) => {
    await page.goto(inventoryUrl())

    await openRow(page, /Soul Drop/)
    const input = page.getByRole("spinbutton", { name: "Quantity" })
    await input.fill("0")
    await input.press("Enter")
    await page.waitForLoadState("networkidle")

    await expect
      .poll(async () => (await target.getRows("soul-drop")).length)
      .toBe(0)
  })

  test("removing an equipped item unequips and deletes it", async ({
    page,
  }) => {
    await page.goto(inventoryUrl())

    await openRow(page, /Longsword/)
    await page.getByRole("button", { name: "Remove" }).click()
    await page.waitForLoadState("networkidle")

    await expect
      .poll(async () => (await target.getRows("longsword")).length)
      .toBe(0)
    // Nothing left equipped in the weapon slot.
    const items = await target.getItems()
    expect(items.some((item) => item.equipped)).toBe(false)
  })

  test("non-stackable rows have no quantity adjuster", async ({ page }) => {
    await page.goto(inventoryUrl())

    await openRow(page, /Longsword/)
    await expect(
      page.getByRole("button", { name: "Increase quantity" })
    ).toHaveCount(0)
    // The equip control is present, confirming the popover opened.
    await expect(page.getByRole("button", { name: "Unequip" })).toBeVisible()
  })

  test("adds currency", async ({ page }) => {
    await page.goto(inventoryUrl())

    await page.getByRole("button", { name: "Adjust currency" }).click()
    await page.getByLabel("Amount").fill("50")
    await page.getByRole("button", { name: "Add", exact: true }).click()
    await page.waitForLoadState("networkidle")

    await expect.poll(target.getCurrency).toBe(150)
  })

  test("spending clamps currency at 0", async ({ page }) => {
    await page.goto(inventoryUrl())

    await page.getByRole("button", { name: "Adjust currency" }).click()
    await page.getByLabel("Amount").fill("999999")
    await page.getByRole("button", { name: "Spend" }).click()
    await page.waitForLoadState("networkidle")

    await expect.poll(target.getCurrency).toBe(0)
  })
})
