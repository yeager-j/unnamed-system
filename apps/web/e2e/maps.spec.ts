import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import {
  mapGeometrySchema,
  mapInstanceStateSchema,
} from "@workspace/game-v2/spatial"

import { getDb, mapInstances, maps } from "@/lib/db"
import { deleteMap, saveMapGeometry } from "@/lib/db/writes/map"

import { STORAGE_STATE } from "./auth.setup"
import {
  cleanup,
  createTestMap,
  createTestMapInstance,
  createTracker,
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

test("create → autosave rename → list → delete", async ({ page }) => {
  await page.goto("/maps")

  await page.getByRole("button", { name: "Create map" }).click()
  await page.getByLabel("Name").fill("Crypt of E2E")
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create map" })
    .click()

  // Landed on the editor for the new Map.
  await page.waitForURL(/\/maps\/[^/]+$/)
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
  await page.goto("/maps")
  await expect(page.getByRole("link", { name: /Sunken Crypt/ })).toBeVisible()

  // …and deletes back to an empty list entry.
  await page.getByRole("link", { name: /Sunken Crypt/ }).click()
  await page.getByRole("button", { name: "Delete map" }).click()
  await page.getByRole("button", { name: "Delete forever" }).click()

  await page.waitForURL("**/maps")
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
