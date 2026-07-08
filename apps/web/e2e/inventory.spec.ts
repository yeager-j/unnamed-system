import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createInventoryTarget } from "./fixtures/inventory-target"

/**
 * UNN-559: the Inventory tab — equipment writes through the entity door
 * (inventory class), the wallet, and the UNN-163 search/filter table.
 *
 *  1. Equip re-folds derived stats in the same interaction (CH18: Bladeturn
 *     Mail's Resist Slash shows on the Combat tab) and persists; unequip
 *     reverts both.
 *  2. Add via the dialog persists rows keyed by catalog item.
 *  3. The qty stepper and remove persist through the same class token.
 *  4. The wallet set persists to `equipment.currency`.
 *  5. Search / category chips / Equipped-only filter the table (pure UI).
 *
 * **Serial**: every test mutates the one target's inventory row set.
 */
test.describe.configure({ mode: "serial" })
test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createInventoryTarget>>

test.beforeAll(async () => {
  target = await createInventoryTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function openInventory(page: Page) {
  await page.goto(target.url)
  await page.getByRole("tab", { name: "Inventory" }).click()
  await expect(page.getByRole("region", { name: "Equipped" })).toBeVisible()
}

function itemRow(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name })
}

test("equip updates the Equipped zone + Combat-tab affinity in-frame, persists, and unequip reverts", async ({
  page,
}) => {
  await openInventory(page)
  const equipped = page.getByRole("region", { name: "Equipped" })
  await expect(equipped).toContainText("Longsword")

  // Hold the Server-Action POST open so the assertions below can only be
  // satisfied by the optimistic frame — without the delay, the route
  // revalidation catches up inside the polling window and a dropped
  // `applyLocal` regression passes silently (verified by reintroduction).
  const HELD_POST_MS = 2500
  await page.route(`**${target.url}`, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, HELD_POST_MS))
    }
    await route.continue()
  })

  await itemRow(page, "Bladeturn Mail")
    .getByRole("button", { name: "Equip" })
    .click()
  await expect(equipped).toContainText("Bladeturn Mail", { timeout: 1500 })

  // CH18: the optimistic re-fold moves the derived affinity in the same
  // frame — the Combat tab's slash cell reads Resist before the POST lands.
  await page.getByRole("tab", { name: "Combat" }).click()
  await expect(page.getByRole("region", { name: "Affinities" })).toContainText(
    /Slash\s*Resist/,
    { timeout: 1500 }
  )

  await page.unroute(`**${target.url}`)
  await expect
    .poll(async () => (await target.getItemRow("bladeturn-mail"))?.equipped)
    .toBe(true)

  await page.getByRole("tab", { name: "Inventory" }).click()
  await itemRow(page, "Bladeturn Mail")
    .getByRole("button", { name: "Unequip" })
    .click()
  await expect(equipped).not.toContainText("Bladeturn Mail")
  await expect
    .poll(async () => (await target.getItemRow("bladeturn-mail"))?.equipped)
    .toBe(false)

  await page.getByRole("tab", { name: "Combat" }).click()
  await expect(
    page.getByRole("region", { name: "Affinities" })
  ).not.toContainText(/Slash\s*Resist/)
})

test("the Add item dialog persists a new catalog row", async ({ page }) => {
  await openInventory(page)
  await page.getByRole("button", { name: "Add item" }).click()

  const dialog = page.getByRole("dialog")
  await dialog.getByRole("option", { name: /Shadow Charm/ }).click()
  await dialog.getByRole("button", { name: "Add Shadow Charm" }).click()

  await expect(itemRow(page, "Shadow Charm")).toBeVisible()
  await expect
    .poll(async () => (await target.getItemRow("shadow-charm"))?.quantity)
    .toBe(1)
})

test("the qty stepper and remove persist through the inventory token", async ({
  page,
}) => {
  await openInventory(page)

  await page
    .getByRole("button", { name: "Increase Soul Drop quantity" })
    .click()
  await expect
    .poll(async () => (await target.getItemRow("soul-drop"))?.quantity)
    .toBe(4)

  await itemRow(page, "Shadow Charm")
    .getByRole("button", { name: "Remove Shadow Charm" })
    .click()
  await expect(itemRow(page, "Shadow Charm")).toHaveCount(0)
  await expect
    .poll(async () => await target.getItemRow("shadow-charm"))
    .toBeNull()
})

test("the wallet set persists to equipment.currency", async ({ page }) => {
  await openInventory(page)

  await page.getByRole("button", { name: "Edit gold" }).click()
  await page.getByRole("spinbutton", { name: "Gold" }).fill("120")
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByRole("region", { name: "Inventory" })).toContainText(
    "120 gp"
  )
  await expect
    .poll(async () => (await target.getEquipment())?.currency)
    .toBe(120)
})

test("search, category chips, and Equipped-only filter the table", async ({
  page,
}) => {
  await openInventory(page)
  const rows = page.getByRole("row").filter({ has: page.getByRole("cell") })

  // Baseline: longsword (equipped), bladeturn-mail, soul-drop.
  await expect(rows).toHaveCount(3)

  await page.getByRole("textbox", { name: "Search items" }).fill("soul")
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText("Soul Drop")
  await page.getByRole("textbox", { name: "Search items" }).fill("")

  await page.getByRole("button", { name: "Consumables" }).click()
  await expect(rows).toHaveCount(1)
  await page.getByRole("button", { name: "Consumables" }).click()

  await page.getByRole("button", { name: "Equipped only" }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText("Longsword")
})
