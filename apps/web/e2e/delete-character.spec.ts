import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import { entity, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"
import { createDeleteTarget } from "./fixtures/delete-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * UNN-181 — type-to-confirm deletion. Target is an ephemeral, factory-minted
 * character (`Wren Halloway`, owned by the dev user) that exists only for this
 * spec, so the happy-path test can retire the row without flaking the read-only
 * specs. Since UNN-571/R1 "delete" is a soft-delete (`deletedAt` tombstone): the
 * row persists but vanishes from every discovery surface and its URL 404s.
 *
 * Tests run in serial mode and depend on each other in a deliberate order: the
 * cancel and disabled-button tests run first while the row still exists; the
 * happy-path test runs last and removes it. `afterAll` cleanup is a no-op by
 * then.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createDeleteTarget>>

test.describe.configure({ mode: "serial" })
test.use({ storageState: STORAGE_STATE })

test.beforeAll(async () => {
  target = await createDeleteTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function openDeleteDialog(page: import("@playwright/test").Page) {
  await page.goto("/")
  const card = page
    .locator('[data-slot="card"]')
    .filter({ hasText: target.name })
  await card.getByRole("button", { name: `Actions for ${target.name}` }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.getByRole("alertdialog", {
      name: new RegExp(`Delete ${target.name}`),
    })
  ).toBeVisible()
}

test.describe("delete character — guarded cases", () => {
  test("Esc closes the dialog without deleting", async ({ page }) => {
    await openDeleteDialog(page)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("alertdialog")).toHaveCount(0)

    const [row] = await getDb()
      .select({ id: entity.id })
      .from(entity)
      .where(eq(entity.id, target.id))
      .limit(1)
    expect(row?.id).toBe(target.id)
  })

  test("Cancel button closes the dialog without deleting", async ({ page }) => {
    await openDeleteDialog(page)
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("Delete forever is disabled until the typed name matches", async ({
    page,
  }) => {
    await openDeleteDialog(page)
    const confirm = page.getByRole("button", { name: "Delete forever" })
    await expect(confirm).toBeDisabled()

    const input = page.getByRole("textbox", {
      name: `Type ${target.name} to confirm`,
    })
    await input.fill("not the right name")
    await expect(confirm).toBeDisabled()

    await input.fill(target.name)
    await expect(confirm).toBeEnabled()

    await page.keyboard.press("Escape")
  })
})

test.describe("delete character — happy path", () => {
  test("confirming tombstones the row, drops the roster card, and 404s the public URL", async ({
    page,
  }) => {
    await openDeleteDialog(page)
    await page
      .getByRole("textbox", { name: `Type ${target.name} to confirm` })
      .fill(target.name)
    await page.getByRole("button", { name: "Delete forever" }).click()

    // The card disappears from the roster after `router.refresh()` lands.
    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: target.name })
    ).toHaveCount(0)
    await expect(page.getByRole("alertdialog")).toHaveCount(0)

    // Persistence (R1): the row survives as a tombstone — `deletedAt` set, no
    // hard delete. Discovery reads filter it out; the row is still there.
    const [row] = await getDb()
      .select({ id: entity.id, deletedAt: entity.deletedAt })
      .from(entity)
      .where(eq(entity.id, target.id))
    expect(row?.id).toBe(target.id)
    expect(row?.deletedAt).toBeInstanceOf(Date)

    // Public URL is 404 immediately.
    const response = await page.goto(target.url)
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole("heading", { name: "Character not found" })
    ).toBeVisible()
  })
})
