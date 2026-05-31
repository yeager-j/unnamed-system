import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { ranksBannerTarget } from "./fixtures/ranks-banner-target"

/**
 * UNN-255: the sheet-wide Saved Archetype Ranks banner. Covers the AC:
 *
 *  1. Owner with `savedArchetypeRanks > 0` sees the banner above the tab
 *     content, with the rank count and an Atlas CTA, on every tab.
 *  2. The CTA navigates to the Lineage Atlas.
 *  3. The banner is suppressed on the Atlas page itself.
 *  4. Dismiss hides it for the session, including across tab switches.
 *  5. Owner-only — a signed-out visitor on the public sheet never sees it.
 *
 * Read-only: dismissal is client `sessionStorage`, so no DB writes and no
 * re-seed coordination. The fixture has its own row purely to keep the asserted
 * rank count off any spec that mutates ranks.
 */

const SHEET_URL = ranksBannerTarget.url
const ATLAS_URL = `${SHEET_URL}/archetypes/atlas`

const bannerLocator = (page: Page) =>
  page.getByRole("status").filter({ hasText: /Archetype Rank/ })

test.describe("Saved Ranks banner", () => {
  test.use({ storageState: STORAGE_STATE })

  test("shows for the owner with the count and Atlas CTA on every tab", async ({
    page,
  }) => {
    for (const tab of ["combat", "explore", "inventory", "archetypes"]) {
      await page.goto(`${SHEET_URL}?tab=${tab}`)
      const banner = bannerLocator(page)
      await expect(banner).toBeVisible()
      await expect(banner).toContainText("2")
      await expect(banner).toContainText(/Archetype Ranks to spend/)
      await expect(
        banner.getByRole("button", { name: "Open Lineage Atlas" })
      ).toBeVisible()
    }
  })

  test("CTA navigates to the Lineage Atlas, where the banner is absent", async ({
    page,
  }) => {
    await page.goto(SHEET_URL)
    await bannerLocator(page)
      .getByRole("button", { name: "Open Lineage Atlas" })
      .click()
    await expect(page).toHaveURL(new RegExp(`${ATLAS_URL}$`))
    await expect(bannerLocator(page)).toHaveCount(0)
  })

  test("dismiss hides it for the session, across tab switches", async ({
    page,
  }) => {
    await page.goto(SHEET_URL)
    const banner = bannerLocator(page)
    await expect(banner).toBeVisible()

    await banner.getByRole("button", { name: "Dismiss" }).click()
    await expect(banner).toHaveCount(0)

    await page.getByRole("tab", { name: "Inventory" }).click()
    await expect(bannerLocator(page)).toHaveCount(0)
  })

  test("is absent on the Atlas page directly", async ({ page }) => {
    await page.goto(ATLAS_URL)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(bannerLocator(page)).toHaveCount(0)
  })
})

test("signed-out visitor never sees the banner", async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  try {
    await page.goto(SHEET_URL)
    await expect(bannerLocator(page)).toHaveCount(0)
  } finally {
    await context.close()
  }
})
