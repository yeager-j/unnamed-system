import { expect, test } from "@playwright/test"

/**
 * End-to-end checks for the ⌘K command palette (UNN-261, per the Command
 * Palette ADR). These cover the read-only surface only — opening, navigation,
 * the empty state, owner-gating, and dismissal — so the spec mutates no state
 * and is safe under Playwright's `fullyParallel`. The owner-only vital actions
 * (Take damage / Heal / Spend SP / Use Prisma) reuse the UNN-155 Server Actions
 * already covered by header-owner-actions.spec.ts, and are asserted here only by
 * their *absence* for a signed-out viewer.
 *
 * Default project viewport is Desktop Chrome — the palette is desktop-only and
 * is suppressed on touch viewports, so these run where it actually exists.
 */

const META_K = "ControlOrMeta+k"

test("opens with ⌘K, lists grouped navigation commands, and closes on Escape", async ({
  page,
}) => {
  await page.goto("/c/seed-warrior?tab=combat")

  await page.keyboard.press(META_K)

  const palette = page.getByRole("dialog")
  await expect(palette).toBeVisible()
  await expect(palette.getByText("Navigate")).toBeVisible()
  await expect(palette.getByText("Jump to Inventory")).toBeVisible()
  await expect(palette.getByText("Open Lineage Atlas")).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(palette).toBeHidden()
})

test("communicates a no-results state for an unmatched query", async ({
  page,
}) => {
  await page.goto("/c/seed-warrior?tab=combat")
  await page.keyboard.press(META_K)

  await page.getByRole("dialog").getByRole("combobox").fill("zzzznotacommand")

  await expect(page.getByText("No commands found.")).toBeVisible()
})

test("a navigation command switches the active sheet tab", async ({ page }) => {
  await page.goto("/c/seed-warrior?tab=combat")
  await page.keyboard.press(META_K)

  await page.getByText("Jump to Inventory").click()

  await expect(page).toHaveURL(/tab=inventory/)
  await expect(page.getByRole("tab", { name: "Inventory" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
})

test("hides owner-only vital commands from a signed-out viewer", async ({
  page,
}) => {
  await page.goto("/c/seed-warrior?tab=combat")
  await page.keyboard.press(META_K)

  const palette = page.getByRole("dialog")
  await expect(palette.getByText("Jump to Combat")).toBeVisible()
  await expect(palette.getByText("Take damage")).toHaveCount(0)
  await expect(palette.getByText("Use Prisma")).toHaveCount(0)
})
