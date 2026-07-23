import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import { templateSetContentSchema } from "@workspace/game-v2/generation"

import { getDb, templateSets } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"
import {
  createDungeonExpansionTarget,
  ENTRY,
} from "./fixtures/dungeon-expansion-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * The **layout tuning harness** (UNN-642) — not a CI test: skipped unless
 * `TUNING_PREVIEW=1`. Patches the region's Template Set to a branching set,
 * starts an expedition (which **pre-generates** the whole map through the real
 * executor), and screenshots the carved board to `test-results/pregen-board.png`.
 * Re-run after every layout-constant tweak; delete once the pass lands.
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

// A branching set (all one tag so adjacency never limits the layout under
// test); the Entry stays bound to "hall".
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

test("pre-generate a branching expedition and screenshot the board", async ({
  page,
}) => {
  const target = await createDungeonExpansionTarget(tracker)
  // Swap in the branching set BEFORE start, so pre-generation carves from it.
  await getDb()
    .update(templateSets)
    .set({ content: previewSet })
    .where(eq(templateSets.id, target.templateSet.id))

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
  const grown = await target.getInstanceState(expedition!.mapInstanceId)
  const zoneCount = Object.keys(grown.geometry.zones).length

  // Zoom out (no fit-view control on the console) so the whole board fits.
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "Zoom out" }).click()
  }
  await page.waitForTimeout(800)
  await page.screenshot({ path: "test-results/pregen-board.png" })

  expect(zoneCount).toBeGreaterThanOrEqual(15)
})
