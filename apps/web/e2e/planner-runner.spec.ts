import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import { emptyMapInstance } from "@workspace/game-v2/spatial"

import { getDb } from "@/lib/db"
import { campaignSlotDungeon } from "@/lib/db/schema/campaign-clock"
import { campaignBeat } from "@/lib/db/schema/campaign-notes"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"

import { STORAGE_STATE } from "./auth.setup"
import { ENCOUNTER_DM_USER_ID } from "./fixtures/encounter-target"
import {
  cleanup,
  createActiveDungeon,
  createTestCampaign,
  createTestCharacter,
  createTracker,
  placeCharacter,
} from "./fixtures/factory"

/**
 * E2E for Planner phase 4 (UNN-577): the runner's Defer/Run loop over
 * recorded downtime (set-aside confirm → derived suppression → defer
 * resurfaces), the prepped-shelf pull-in, Mark resolved's rail auto-advance,
 * a dungeon slot claim, the day-end warning's Resolve All (bulk Idle fill),
 * and the frozen-past delete rejection. One fresh campaign per run (the
 * write-spec factory pattern); **serial** — each test builds on the last's
 * state, walking the DM's real run-the-day arc.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const tracker = createTracker()
let campaign: Awaited<ReturnType<typeof createTestCampaign>>
let character: Awaited<ReturnType<typeof createTestCharacter>>
let dungeon: Awaited<ReturnType<typeof createActiveDungeon>>

test.beforeAll(async () => {
  campaign = await createTestCampaign(tracker, {
    dmUserId: ENCOUNTER_DM_USER_ID,
    name: "Planner Runner Campaign",
  })
  character = await createTestCharacter(tracker, { name: "Runner Hero" })
  await placeCharacter(character.id, campaign.id)
  dungeon = await createActiveDungeon(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
    mapInstanceState: emptyMapInstance(),
    name: "The Drowned Vault",
  })
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test("run a new beat over recorded downtime: confirm, suppress, defer resurfaces", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Start the clock" }).click()
  await expect(page.getByRole("heading", { name: "Run the day" })).toBeVisible()

  // Record downtime on Morning (the active slot).
  await page
    .getByRole("textbox", { name: `${character.name}'s activity` })
    .fill("Trained sword forms in the yard.")
  await page.getByRole("button", { name: "Activity type" }).click()
  await page.getByRole("menuitem", { name: /Talent/ }).click()
  await page.getByRole("button", { name: "Record activity" }).click()
  await expect(page.getByText("Downtime · 1 / 1 recorded")).toBeVisible()

  // Pull a NEW beat into the recorded slot — the set-aside confirm fires.
  await page.getByRole("button", { name: "Run story beat" }).click()
  await page.getByRole("menuitem", { name: "New story beat" }).click()
  await expect(page.getByText("Run a story beat here?")).toBeVisible()
  await page.getByRole("button", { name: "Run beat anyway" }).click()

  // The slot flips to story; the entry is suppressed but disclosure-readable.
  await expect(page.getByText("Story · Untitled beat")).toBeVisible()
  await page
    .getByRole("button", { name: /Set aside · 1 recorded entry/ })
    .click()
  await expect(page.getByText("Trained sword forms in the yard.")).toBeVisible()

  // Defer → the shelf keeps the beat with provenance; the entry resurfaces.
  await page.getByRole("button", { name: "Defer" }).click()
  await page.getByRole("button", { name: "Defer to shelf" }).click()
  await expect(page.getByText("Downtime · 1 / 1 recorded")).toBeVisible()
  await expect(page.getByText("Trained sword forms in the yard.")).toBeVisible()
  await expect
    .poll(async () => {
      const beat = await readBeat()
      return {
        floating: beat.floating,
        hasProvenance: beat.deferredFromSlotId !== null,
      }
    })
    .toEqual({ floating: true, hasProvenance: true })
})

test("pull the deferred beat back in and resolve; the rail auto-advances", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  await page.getByRole("button", { name: "Run story beat" }).click()
  await expect(page.getByText("Prepped beats · 1")).toBeVisible()
  await page.getByRole("menuitem", { name: /Untitled beat/ }).click()
  await page.getByRole("button", { name: "Run beat anyway" }).click()
  await expect(page.getByText("Story · Untitled beat")).toBeVisible()

  await page.getByRole("button", { name: "Mark resolved" }).click()
  await expect.poll(async () => (await readBeat()).resolvedAt).not.toBeNull()
  // Auto-advance: the rail moved on to Evening's downtime workspace.
  await expect(
    page.getByRole("textbox", { name: `${character.name}'s activity` })
  ).toBeVisible()
})

test("claim the evening slot for a dungeon", async ({ page }) => {
  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: /Evening/ }).click()

  await page.getByRole("button", { name: "Run a dungeon" }).click()
  await page.getByRole("menuitem", { name: /The Drowned Vault/ }).click()

  await expect(page.getByText("Dungeon · The Drowned Vault")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Open dungeon console" })
  ).toBeVisible()
  await expect
    .poll(async () => {
      const claims = await getDb()
        .select()
        .from(campaignSlotDungeon)
        .where(eq(campaignSlotDungeon.dungeonId, dungeon.id))
      return claims.length
    })
    .toBe(1)
})

test("day-end warning: Resolve All resolves the claim and fills nothing extra", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  // Morning story resolved + Evening claim unresolved ⇒ warning, not confirm.
  await page.getByRole("button", { name: "End the day" }).click()
  await expect(page.getByText("End Day 1 with loose ends?")).toBeVisible()
  await page.getByRole("button", { name: "Resolve All" }).click()

  await expect(page.getByText("Day 2", { exact: true }).first()).toBeVisible()
  await expect
    .poll(async () => {
      const [claim] = await getDb()
        .select()
        .from(campaignSlotDungeon)
        .where(eq(campaignSlotDungeon.dungeonId, dungeon.id))
      return claim?.resolvedAt !== null
    })
    .toBe(true)
  // Both day-1 slots were story/dungeon — no Idle rows were needed.
  const idles = await getDb()
    .select()
    .from(campaignUpdate)
    .where(eq(campaignUpdate.campaignId, campaign.id))
  expect(idles.filter((row) => row.category === "idle")).toHaveLength(0)
})

test("ready path: a complete day takes the plain confirm through the advance recount", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  // Fill both Day-2 downtime slots so the day is genuinely complete. (The
  // active pill also renders a "Rename ⟨label⟩" icon button, so match pills
  // by their "Slot N" kicker.)
  for (const slot of ["Slot 1", "Slot 2"]) {
    await page.getByRole("button", { name: new RegExp(slot) }).click()
    await page
      .getByRole("button", { name: `Mark ${character.name} idle` })
      .click()
    await expect(page.getByText("Downtime · 1 / 1 recorded")).toBeVisible()
  }

  // Ready ⇒ the plain confirm (not the warning); mode "advance" recounts
  // server-side and advances.
  await page.getByRole("button", { name: "End the day" }).click()
  await expect(page.getByText("End Day 2 — advance to Day 3")).toBeVisible()
  await page.getByRole("button", { name: "End the day" }).last().click()
  await expect(page.getByText("Day 3", { exact: true }).first()).toBeVisible()
})

test("frozen past: yesterday's beat rejects deletion with a reason", async ({
  page,
}) => {
  const beat = await readBeat()
  await page.goto(`/campaigns/${campaign.shortId}/notes?beat=${beat.id}`)

  await page.getByRole("button", { name: "Delete beat" }).click()
  await page.getByRole("button", { name: "Delete beat" }).last().click()

  await expect(page.getByText(/ran on a past day/)).toBeVisible()
  const rows = await getDb()
    .select()
    .from(campaignBeat)
    .where(eq(campaignBeat.id, beat.id))
  expect(rows).toHaveLength(1)
})

/** The run's one beat row (this spec creates the campaign, so it's ours). */
async function readBeat() {
  const rows = await getDb()
    .select()
    .from(campaignBeat)
    .where(eq(campaignBeat.campaignId, campaign.id))
  expect(rows).toHaveLength(1)
  return rows[0]!
}
