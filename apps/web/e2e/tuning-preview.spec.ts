import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import {
  rollExpansion,
  templateSetContentSchema,
} from "@workspace/game-v2/generation"
import {
  reduceMapInstance as createReduceMapInstance,
  reduceDungeon,
} from "@workspace/game-v2/spatial"

import { dungeons, getDb, mapInstances } from "@/lib/db"

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

  // A branching set (preview-only — the gesture spec keeps the minimal one):
  // varied exit counts so the board forks, all sharing one tag so adjacency
  // never limits the layout under test. A light closure chance to show loops.
  const previewSet = templateSetContentSchema.parse({
    templates: {
      hall: {
        key: "hall",
        tags: ["street"],
        accepts: ["street"],
        weight: 3,
        exits: [{ optional: false }, { optional: true }, { optional: true }],
      },
      junction: {
        key: "junction",
        tags: ["street"],
        accepts: ["street"],
        weight: 2,
        exits: [
          { optional: false },
          { optional: false },
          { optional: false },
          { optional: true },
        ],
      },
      vault: {
        key: "vault",
        tags: ["street"],
        accepts: ["street"],
        weight: 1,
        exits: [{ optional: false }],
      },
    },
    connectorTemplateKey: "hall",
    closureChance: 0.12,
  })
  const setRow = { content: previewSet }
  // Rebind the Entry zone to a template in the preview set so its start-stubs
  // and every mint speak the same tag vocabulary.
  const [entryInstance] = await db
    .select({ state: mapInstances.state, version: mapInstances.version })
    .from(mapInstances)
    .where(eq(mapInstances.id, expedition!.mapInstanceId))
    .limit(1)
  const rebound = structuredClone(entryInstance!.state)
  for (const zone of Object.values(rebound.geometry.zones)) {
    if (zone.templateKey !== undefined) zone.templateKey = "junction"
  }
  await db
    .update(mapInstances)
    .set({ state: rebound, version: entryInstance!.version + 1 })
    .where(eq(mapInstances.id, expedition!.mapInstanceId))

  // Grow the expedition with the pure engine, exactly as the executor folds.
  // Pick a RANDOM open stub each step (not always the first) so a dead-ending
  // branch can't starve the frontier — the preview needs a full board, and
  // depth-first growth collapses on unlucky seeds.
  const reduceInstance = createReduceMapInstance(() => crypto.randomUUID())
  for (let i = 0; i < 200; i++) {
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
    const zoneCount = Object.keys(instanceRow!.state.geometry.zones).length
    if (zoneCount >= 30) break
    const stubIds = Object.keys(instanceRow!.state.generation.stubs)
    if (stubIds.length === 0) break
    const stubId = stubIds[Math.floor(Math.random() * stubIds.length)]!

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
