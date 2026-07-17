import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import {
  mapGeometrySchema,
  mapInstanceStateSchema,
} from "@workspace/game-v2/spatial"

import { getDb, mapInstances, maps } from "@/lib/db"
import { deleteMap, saveMapGeometry } from "@/lib/db/writes/map"
import { stageMapsPath } from "@/lib/paths"

import { STORAGE_STATE } from "./auth.setup"
import {
  cleanup,
  createTestMap,
  createTestMapInstance,
  createTracker,
  testGeometry,
} from "./fixtures/factory"

/**
 * E2E for My Maps (UNN-460): the CRUD surface (create → autosave rename → list →
 * delete) and the two real-DB authorization/isolation guarantees the unit layer
 * (node env, no DB) can't reach — snapshot isolation (editing a Map never touches
 * a referencing Instance) and the `mapInstance.mapId` set-null FK (an Instance
 * survives its Map's deletion). The owner gate is unit-tested in
 * `lib/auth/map-access.test.ts`; here it's checked end-to-end (a non-owner 404s).
 *
 * Signed in as the dev user (storage-state) except the explicit signed-out case.
 */
test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
const createdMapShortIds: string[] = []

test.afterAll(async () => {
  for (const shortId of createdMapShortIds) {
    await getDb().delete(maps).where(eq(maps.shortId, shortId))
  }
  await cleanup(tracker)
})

test("the Stage root opens the Maps library beside the live Sets item", async ({
  page,
}) => {
  await page.goto("/stage")

  await expect(page).toHaveURL(stageMapsPath())
  const libraryNav = page.getByRole("navigation", {
    name: "Authoring library",
  })
  await expect(libraryNav.getByRole("link", { name: "Maps" })).toHaveAttribute(
    "aria-current",
    "page"
  )
  await expect(libraryNav.getByRole("link", { name: "Sets" })).toBeVisible()
  await expect(page.getByRole("link", { name: "My Campaigns" })).toBeVisible()
})

test("legacy Map URLs are a hard cutover", async ({ page }) => {
  const response = await page.goto("/maps")

  expect(response?.status()).toBe(404)
  await expect(page).toHaveURL(/\/maps$/)
})

test("create → autosave rename → list → delete", async ({ page }) => {
  await page.goto(stageMapsPath())

  await page.getByRole("button", { name: "Create map" }).click()
  await page.getByLabel("Name").fill("Crypt of E2E")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create map" })
    .click()

  // Landed on the editor for the new Map.
  await page.waitForURL(/\/stage\/maps\/[^/]+$/)
  await expect(
    page.getByRole("navigation", { name: "Authoring library" })
  ).toHaveCount(0)
  const shortId = page.url().split("/").pop()!
  createdMapShortIds.push(shortId)

  // Rename autosaves on blur — no Save button.
  const nameInput = page.getByRole("textbox", { name: "Map name" })
  await nameInput.fill("Sunken Crypt")
  await nameInput.blur()

  await expect
    .poll(async () => {
      const [row] = await getDb()
        .select({ name: maps.name })
        .from(maps)
        .where(eq(maps.shortId, shortId))
        .limit(1)
      return row?.name
    })
    .toBe("Sunken Crypt")

  // The renamed Map shows in the list…
  await page.goto(stageMapsPath())
  await expect(page.getByRole("link", { name: /Sunken Crypt/ })).toBeVisible()

  // …and deletes back to an empty list entry.
  await page.getByRole("link", { name: /Sunken Crypt/ }).click()
  await page.getByRole("button", { name: "Delete map" }).click()
  await page.getByRole("button", { name: "Delete forever" }).click()

  await page.waitForURL("**/stage/maps")
  await expect(page.getByRole("link", { name: /Sunken Crypt/ })).toHaveCount(0)
})

test("editing a Map leaves a referencing Instance unchanged (snapshot isolation)", async () => {
  const map = await createTestMap(tracker, { name: "Iso Map" })
  const state = mapInstanceStateSchema.parse({})
  const instance = await createTestMapInstance(tracker, {
    mapId: map.id,
    state,
  })

  const geometry = mapGeometrySchema.parse({
    zones: {
      z1: {
        id: "z1",
        name: "New Wing",
        position: { x: 5, y: 7 },
        pageId: "default",
      },
    },
  })
  const result = await saveMapGeometry(map.id, geometry, 0)
  expect(result.ok).toBe(true)

  const [row] = await getDb()
    .select()
    .from(mapInstances)
    .where(eq(mapInstances.id, instance.id))
    .limit(1)

  expect(row?.state).toEqual(state)
  expect(row?.version).toBe(0)
})

test("deleting a Map nulls the Instance back-reference; the Instance survives", async () => {
  const map = await createTestMap(tracker, { name: "FK Map" })
  const instance = await createTestMapInstance(tracker, { mapId: map.id })

  await deleteMap(map.id)

  const [row] = await getDb()
    .select()
    .from(mapInstances)
    .where(eq(mapInstances.id, instance.id))
    .limit(1)

  expect(row).toBeDefined()
  expect(row?.mapId).toBeNull()

  const mapRows = await getDb().select().from(maps).where(eq(maps.id, map.id))
  expect(mapRows).toHaveLength(0)
})

test("the editor 404s for a non-owner", async ({ browser }) => {
  const map = await createTestMap(tracker, { name: "Private Map" })

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  const response = await page.goto(map.url)

  expect(response?.status()).toBe(404)
  await context.close()
})

test("pages: tabs render, chips replace cross-page edges, chip navigates, new page autosaves (UNN-586)", async ({
  page,
}) => {
  const map = await createTestMap(tracker, {
    name: "Paged Map",
    geometry: testGeometry({
      pages: [
        { id: "default", name: "Page 1" },
        { id: "p2", name: "Undercroft" },
      ],
      zones: [
        { id: "z-hall", name: "Hall", x: 0, y: 0 },
        { id: "z-ossuary", name: "Ossuary", pageId: "p2", x: 400, y: 0 },
      ],
      connections: [{ id: "c-cross", from: "z-hall", to: "z-ossuary" }],
    }),
  })

  await page.goto(map.url)

  // One page at a time: the first page's zone renders, the far page's doesn't;
  // the cross-page connection is a chip, not an edge.
  await expect(
    page.getByRole("button", { name: "Page 1", exact: true })
  ).toBeVisible()
  await expect(page.getByLabel("Zone: Hall")).toBeVisible()
  await expect(page.getByLabel("Zone: Ossuary")).toHaveCount(0)
  // The card mounts all three tier layers, so the chip exists once per layer
  // and BOTH copies count as Playwright-visible during the ~0.3s tier
  // crossfade (visibility flips on a delay). toHaveCount polls past the fade
  // where a bare toBeVisible would abort on the strict-mode violation.
  const chip = page
    .getByRole("button", { name: "Leads to Ossuary on Undercroft" })
    .filter({ visible: true })
  await expect(chip).toHaveCount(1)

  // In the editor the chip opens its connection menu (the cross-page link has
  // no edge, so the chip carries the edit controls too); "Go to" navigates to
  // the far page, and the reciprocal chip sits on the far zone.
  await chip.click()
  await page.getByRole("menuitem", { name: "Go to Ossuary" }).click()
  await expect(page.getByLabel("Zone: Ossuary")).toBeVisible()
  await expect(page.getByLabel("Zone: Hall")).toHaveCount(0)
  await expect(
    page
      .getByRole("button", { name: "Leads to Hall on Page 1" })
      .filter({ visible: true })
  ).toHaveCount(1)

  // Page CRUD rides the existing whole-blob autosave.
  await page.getByRole("button", { name: "New page" }).click()
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true })
  ).toBeVisible()
  await expect
    .poll(async () => {
      const [row] = await getDb()
        .select({ geometry: maps.geometry })
        .from(maps)
        .where(eq(maps.id, map.id))
        .limit(1)
      return Object.keys(row?.geometry.pages ?? {}).length
    })
    .toBe(3)
})
