import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import { rollExpansion } from "@workspace/game-v2/generation"
import {
  reduceMapInstance as createReduceMapInstance,
  reduceDungeon,
} from "@workspace/game-v2/spatial"

import { dungeons, getDb, mapInstances, templateSets } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"
import {
  createDungeonExpansionTarget,
  ENTRY,
} from "./fixtures/dungeon-expansion-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * The **layout tuning harness** (UNN-642) — not a CI test: skipped unless
 * `TUNING_PREVIEW=1`. Starts an expedition through the real UI, grows it to
 * ~25 zones by driving the pure roller + reducers directly against the rows
 * (the same fold the executor runs — the click gesture itself is covered by
 * `dungeon-expansion.spec.ts`), reloads the console, and screenshots the
 * board to `test-results/expansion-board.png`. Re-run after every
 * layout-constant tweak during the tuning pass; delete once the pass lands.
 */

test.skip(
  !process.env.TUNING_PREVIEW,
  "tuning harness — run with TUNING_PREVIEW=1"
)
test.use({ storageState: STORAGE_STATE })
test.setTimeout(180_000)

const tracker = createTracker()

test.afterAll(async () => {
  await cleanup(tracker)
})

test("grow a ~25-zone expedition and screenshot the board", async ({
  page,
}) => {
  const target = await createDungeonExpansionTarget(tracker)
  await page.goto(target.region.url)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "New expedition" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name").fill("Tuning Preview")
  await dialog.getByRole("button", { name: "Start expedition" }).click()
  await page.waitForURL(/\/dungeon\//)
  await page.waitForLoadState("networkidle")
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: ENTRY.name }).click()
  await page.getByRole("button", { name: "Start expedition" }).click()
  await expect(page.getByRole("button", { name: "Advance turn" })).toBeVisible()

  const [expedition] = await target.getExpeditions()
  const db = getDb()
  const [setRow] = await db
    .select({ content: templateSets.content })
    .from(templateSets)
    .where(eq(templateSets.id, target.templateSet.id))
    .limit(1)

  // Grow the expedition with the pure engine, exactly as the executor folds.
  const reduceInstance = createReduceMapInstance(() => crypto.randomUUID())
  for (let i = 0; i < 24; i++) {
    const [instanceRow] = await db
      .select({ state: mapInstances.state, version: mapInstances.version })
      .from(mapInstances)
      .where(eq(mapInstances.id, expedition!.mapInstanceId))
      .limit(1)
    const [dungeonRow] = await db
      .select({ state: dungeons.state, version: dungeons.version })
      .from(dungeons)
      .where(eq(dungeons.id, expedition!.id))
      .limit(1)
    const stubId = Object.keys(instanceRow!.state.generation.stubs)[0]
    if (stubId === undefined) break

    const rolled = rollExpansion({
      set: setRow!.content,
      instanceState: instanceRow!.state,
      ledger: dungeonRow!.state.generation,
      stubId,
      newId: () => crypto.randomUUID(),
    })
    if (!rolled.ok) throw new Error(rolled.error)

    const nextInstance = rolled.value.instanceEvents.reduce(
      reduceInstance,
      instanceRow!.state
    )
    const nextDungeon = rolled.value.dungeonEvents.reduce(
      reduceDungeon,
      dungeonRow!.state
    )
    await db
      .update(mapInstances)
      .set({ state: nextInstance, version: instanceRow!.version + 1 })
      .where(eq(mapInstances.id, expedition!.mapInstanceId))
    await db
      .update(dungeons)
      .set({ state: nextDungeon, version: dungeonRow!.version + 1 })
      .where(eq(dungeons.id, expedition!.id))
  }

  // Reload the console over the grown expedition; zoom out; screenshot.
  await page.reload()
  await expect(page.getByRole("button", { name: "Advance turn" })).toBeVisible()
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "Zoom out" }).click()
  }
  await page.waitForTimeout(800)
  await page.screenshot({
    path: "test-results/expansion-board.png",
    fullPage: false,
  })

  const grown = await target.getInstanceState(expedition!.mapInstanceId)
  expect(Object.keys(grown.geometry.zones).length).toBeGreaterThanOrEqual(15)
})
