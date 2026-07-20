import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { getDb, templateSets } from "@/lib/db"
import { stageSetsPath } from "@/lib/paths"

import { STORAGE_STATE } from "./auth.setup"
import {
  cleanup,
  createTestTemplateSet,
  createTracker,
} from "./fixtures/factory"

/**
 * E2E for Template Sets (UNN-588): the authoring loop the unit layers can't
 * reach end-to-end — create → redirect into the editor, serialized whole-blob
 * autosave (rename + template/table edits), the
 * **advisory** contract (a lint finding renders while the save still lands),
 * the connector-tombstone liveness guard, soft delete (row survives with
 * `deletedAt`), and the owner gate (a non-owner 404s).
 *
 * Write-then-read assertions poll the DB (AGENTS.md: `networkidle` can fire
 * before a Server Action's write commits). Signed in as the dev user except
 * the explicit non-owner case.
 */
test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
const createdSetShortIds: string[] = []

/** The editor sidebar's nav landmark — scopes item lookups away from the lint
 *  rail, whose finding buttons carry the same template names. */
function setNav(page: Page) {
  return page.getByRole("navigation", { name: "Set contents" })
}

async function loadSetByShortId(shortId: string) {
  const [row] = await getDb()
    .select()
    .from(templateSets)
    .where(eq(templateSets.shortId, shortId))
    .limit(1)
  return row ?? null
}

test.afterAll(async () => {
  for (const shortId of createdSetShortIds) {
    await getDb().delete(templateSets).where(eq(templateSets.shortId, shortId))
  }
  await cleanup(tracker)
})

test("the Sets library item is live and lists the viewer's sets", async ({
  page,
}) => {
  const set = await createTestTemplateSet(tracker)

  await page.goto("/stage/maps")
  const libraryNav = page.getByRole("navigation", {
    name: "Authoring library",
  })
  await libraryNav.getByRole("link", { name: "Sets" }).click()

  await expect(page).toHaveURL(stageSetsPath())
  await expect(page.getByRole("link", { name: set.name })).toBeVisible()
})

test("create → redirect → rename autosaves", async ({ page }) => {
  await page.goto(stageSetsPath())
  await page.getByRole("button", { name: "Create set" }).click()
  await page.getByLabel("Name").fill("E2E Created Set")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create set" })
    .click()

  await expect(page).toHaveURL(/\/stage\/sets\/[a-zA-Z0-9_-]+/)
  const shortId = page.url().split("/stage/sets/")[1]!.split("?")[0]!
  createdSetShortIds.push(shortId)

  // The editor landed on Set settings with the created name in the sidebar.
  await expect(page.getByLabel("Set name")).toHaveValue("E2E Created Set")

  await page.getByLabel("Set name").fill("E2E Renamed Set")
  await page.getByLabel("Set name").blur()

  await expect
    .poll(async () => (await loadSetByShortId(shortId))?.name)
    .toBe("E2E Renamed Set")
  const row = await loadSetByShortId(shortId)
  expect(row!.version).toBeGreaterThan(0)
})

test("template + table authoring round-trips the blob; lint is advisory, never save-blocking", async ({
  page,
}) => {
  const set = await createTestTemplateSet(tracker)
  await page.goto(set.url)

  // Mint a template from the sidebar; the form autofocuses the name. Wait for
  // the minted form's heading before filling — during the selection switch the
  // previous view's "Name" input can still be mounted and would swallow the
  // fill.
  await page.getByRole("button", { name: "Add template" }).click()
  await expect(
    page.getByRole("heading", { name: "New template" })
  ).toBeVisible()
  await page.getByLabel("Name", { exact: true }).fill("Haze Alley")

  await expect
    .poll(async () => {
      const row = await loadSetByShortId(set.shortId)
      return Object.values(row?.content.templates ?? {}).map((t) => t.name)
    })
    .toContain("Haze Alley")

  // Mint a table the same way (same heading-wait rationale).
  await page.getByRole("button", { name: "Add table" }).click()
  await expect(page.getByRole("heading", { name: "New table" })).toBeVisible()
  await page.getByLabel("Name", { exact: true }).fill("Street Encounters")

  await expect
    .poll(async () => {
      const row = await loadSetByShortId(set.shortId)
      return Object.values(row?.content.tables ?? {}).map((t) => t.name)
    })
    .toContain("Street Encounters")

  // A weighted row renders its derived d100 band (single row = 1–100).
  await page.getByRole("button", { name: "Add row" }).click()
  await expect(page.getByText("1–100")).toBeVisible()

  // The advisory contract: the fresh template has no tags/accepts, so the
  // lint rail flags it unmintable — while the blob save above already landed.
  const lintRail = page.getByRole("complementary", { name: "Set lint" })
  await expect(lintRail.getByText("Unmintable templates")).toBeVisible()

  // Reload: everything came back from the persisted blob, not client state.
  await page.reload()
  await expect(
    setNav(page).getByRole("button", { name: "Haze Alley" })
  ).toBeVisible()
  await expect(
    setNav(page).getByRole("button", { name: "Street Encounters" })
  ).toBeVisible()
})

test("deleting the designated connector tombstones it instead of removing", async ({
  page,
}) => {
  const set = await createTestTemplateSet(tracker)
  await page.goto(set.url)

  await page.getByRole("button", { name: "Add template" }).click()
  await expect(
    page.getByRole("heading", { name: "New template" })
  ).toBeVisible()
  await page.getByLabel("Name", { exact: true }).fill("Connector Hall")
  await expect
    .poll(async () => {
      const row = await loadSetByShortId(set.shortId)
      return Object.values(row?.content.templates ?? {}).map((t) => t.name)
    })
    .toContain("Connector Hall")

  // Designate it as the connector from Set settings.
  await setNav(page).getByRole("button", { name: "Set settings" }).click()
  await page.getByRole("combobox").filter({ hasText: "No connector" }).click()
  await page.getByRole("option", { name: "Connector Hall" }).click()
  await expect
    .poll(
      async () =>
        (await loadSetByShortId(set.shortId))?.content.connectorTemplateKey
    )
    .toBeTruthy()

  // Delete routes through the tombstone guard: the template survives,
  // tombstoned, still designated.
  await setNav(page).getByRole("button", { name: "Connector Hall" }).click()
  await page.getByRole("button", { name: "Delete template" }).click()

  await expect
    .poll(async () => {
      const row = await loadSetByShortId(set.shortId)
      const template = Object.values(row?.content.templates ?? {}).find(
        (t) => t.name === "Connector Hall"
      )
      return template?.tombstoned
    })
    .toBe(true)
  await expect(setNav(page).getByText("Tombstoned")).toBeVisible()
})

test("soft delete hides the set but keeps the row, stamped deletedAt", async ({
  page,
}) => {
  const set = await createTestTemplateSet(tracker)
  await page.goto(set.url)

  await page.getByRole("button", { name: "Delete set" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete set" })
    .click()

  await expect(page).toHaveURL(stageSetsPath())
  await expect(page.getByRole("link", { name: set.name })).toHaveCount(0)

  // The row survives for future durable references — deletedAt, not DELETE.
  const row = await loadSetByShortId(set.shortId)
  expect(row).not.toBeNull()
  expect(row!.deletedAt).not.toBeNull()

  // The editor URL is gone too (the loader filters deletedAt).
  await page.goto(set.url)
  await expect(page.getByText("404")).toBeVisible()
})

test("the editor 404s for a non-owner", async ({ browser }) => {
  const set = await createTestTemplateSet(tracker)

  // `newContext()` inherits the test's authed storageState by default — the
  // empty override is what makes this context actually signed out (the maps
  // spec's precedent).
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  const response = await page.goto(set.url)

  expect(response?.status()).toBe(404)
  await context.close()
})
