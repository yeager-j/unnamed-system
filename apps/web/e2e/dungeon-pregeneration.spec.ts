import { expect, test, type Page } from "@playwright/test"

import { DEFAULT_PREGEN_MAX_DEPTH } from "@workspace/game-v2/generation"

import { STORAGE_STATE } from "./auth.setup"
import {
  createDungeonExpansionTarget,
  ENTRY,
} from "./fixtures/dungeon-expansion-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * The UNN-642 pre-generation, end to end: starting an expedition
 * **pre-generates the map out to the depth limit** server-side (no per-room
 * click, no per-carve turn cost), then **leaves the outer ring's frontier
 * open** so the DM can still expand further live via the ghost buttons. This
 * spec drives a real start through the console and asserts the persisted map
 * (DB polling per the write-then-read doctrine) plus the open frontier.
 */

test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createDungeonExpansionTarget>>

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createDungeonExpansionTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function mintAndStartExpedition(page: Page, name: string) {
  await page.goto(target.region.url)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "New expedition" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Name").fill(name)
  await dialog.getByRole("button", { name: "Start expedition" }).click()

  await page.waitForURL(/\/dungeon\//)
  await page.waitForLoadState("networkidle")
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: ENTRY.name }).click()
  await page.getByRole("button", { name: "Start expedition" }).click()

  await expect(page.getByRole("button", { name: "Advance turn" })).toBeVisible()
}

test("starting an expedition pre-generates the map to depth with an open frontier at turn 0", async ({
  page,
}) => {
  await mintAndStartExpedition(page, "Pre-generated Expedition")

  const [expedition] = await target.getExpeditions()
  expect(expedition).toBeDefined()
  expect(expedition!.status).toBe("active")

  // The whole map is carved at start — many zones, not the one authored Entry.
  const started = await target.getInstanceState(expedition!.mapInstanceId)
  const zones = Object.values(started.geometry.zones)
  expect(zones.length).toBeGreaterThanOrEqual(6)

  // Nothing is carved past the depth limit (rings out from the entrance).
  const depths = Object.values(started.generation.zones).map((p) => p.depth)
  expect(Math.max(...depths)).toBeLessThanOrEqual(DEFAULT_PREGEN_MAX_DEPTH)

  // Every zone but the authored Entry was generated, and each recorded a mint.
  const generated = Object.entries(started.generation.zones).filter(
    ([, provenance]) => provenance.source === "generated"
  )
  expect(generated.length).toBe(zones.length - 1)
  const dungeonState = await target.getDungeonState(expedition!.id)
  for (const [zoneId] of generated) {
    expect(dungeonState.generation.mints[zoneId]).toBeDefined()
  }

  // The frontier stays open — the outer ring's stubs are the live edge, each
  // hanging off a max-depth zone.
  const openStubs = Object.values(started.generation.stubs)
  expect(openStubs.length).toBeGreaterThan(0)
  for (const stub of openStubs) {
    expect(started.generation.zones[stub.zoneId]?.depth).toBe(
      Math.max(...depths)
    )
  }

  // Pre-generation cost no dungeon turns — play begins at turn 0.
  expect(dungeonState.turnCounter).toBe(0)

  // The board renders the carved rooms and the frontier ghosts are expandable.
  await expect(page.locator('[data-id="' + ENTRY.id + '"]')).toBeVisible()
  const generatedNode = page.locator(`[data-id="${generated[0]![0]}"]`)
  await expect(generatedNode).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Expand passage off/ }).first()
  ).toBeVisible()
})
