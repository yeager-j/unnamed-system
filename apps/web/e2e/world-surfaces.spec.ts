import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaignArticle, campaignNpc } from "@/lib/db/schema/campaign-world"
import { entity } from "@/lib/db/schema/entity"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTestCampaign, createTracker } from "./fixtures/factory"

/**
 * E2E for the world substrate (UNN-575, re-pointed at the UNN-579 tree UI):
 * the NPC dual-mint through the rail's New-NPC dialog, and the tombstone
 * deletes through the detail pages — the real-DB proof vitest can't give
 * (tx atomicity, the shared-id mint, the lineage-returns-to-the-deck clear).
 * Serial: the delete tests consume the rows the mint tests create.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const DEV_ID = "dev-user-claude"
const NPC_NAME = "Maren E2E"
const ARTICLE_NAME = "Saltmere E2E"

const tracker = createTracker()
let campaign: Awaited<ReturnType<typeof createTestCampaign>>

test.beforeAll(async () => {
  campaign = await createTestCampaign(tracker, { dmUserId: DEV_ID })
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function readNpc() {
  const [row] = await getDb()
    .select({
      entityId: campaignNpc.entityId,
      arcana: campaignNpc.arcana,
      lineageKey: campaignNpc.lineageKey,
      deletedAt: entity.deletedAt,
    })
    .from(campaignNpc)
    .innerJoin(entity, eq(entity.id, campaignNpc.entityId))
    .where(
      and(eq(campaignNpc.campaignId, campaign.id), eq(entity.name, NPC_NAME))
    )
  return row ?? null
}

async function readArticle() {
  const [row] = await getDb()
    .select({ id: campaignArticle.id, deletedAt: campaignArticle.deletedAt })
    .from(campaignArticle)
    .where(
      and(
        eq(campaignArticle.campaignId, campaign.id),
        eq(campaignArticle.name, ARTICLE_NAME)
      )
    )
  return row ?? null
}

test("quick-mints an NPC from the rail in one gesture — dual-mint + detail page", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/npcs`)
  await page.getByRole("button", { name: "New NPC" }).click()
  await page.getByLabel("Name").fill(NPC_NAME)
  await page.getByRole("button", { name: "Create" }).click()

  // Mint navigates straight into the new NPC's page (URL carries the entity id).
  await expect.poll(async () => (await readNpc()) !== null).toBe(true)
  const npc = await readNpc()
  expect(npc!.deletedAt).toBeNull()
  await expect(page).toHaveURL(
    new RegExp(`/campaigns/${campaign.shortId}/npcs/${npc!.entityId}`)
  )
})

test("deleting the NPC tombstones the entity and returns the Lineage to the deck", async ({
  page,
}) => {
  // Author traits directly on the subtype so the delete has something to clear.
  const npc = await readNpc()
  await getDb()
    .update(campaignNpc)
    .set({ arcana: "The Moon", lineageKey: "warlock" })
    .where(eq(campaignNpc.entityId, npc!.entityId))

  await page.goto(`/campaigns/${campaign.shortId}/npcs/${npc!.entityId}`)
  await page.getByRole("button", { name: "Delete NPC" }).first().click()
  await page
    .getByRole("button", { name: "Delete NPC", exact: true })
    .last()
    .click()

  // One transaction: the entity tombstones AND both traits clear (D4 + D8).
  await expect
    .poll(async () => {
      const row = await readNpc()
      return (
        row !== null &&
        row.deletedAt !== null &&
        row.arcana === null &&
        row.lineageKey === null
      )
    })
    .toBe(true)

  // Tombstones leave the rail; the delete lands back on the index.
  await expect(page).toHaveURL(
    new RegExp(`/campaigns/${campaign.shortId}/npcs$`)
  )
  await expect(page.getByRole("link", { name: NPC_NAME })).toBeHidden()
})

test("quick-mints an Article and tombstones it from its page", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/articles`)
  await page.getByRole("button", { name: "New article" }).click()
  await page.getByLabel("Name").fill(ARTICLE_NAME)
  await page.getByRole("button", { name: "Create" }).click()

  await expect.poll(async () => (await readArticle()) !== null).toBe(true)
  const article = await readArticle()
  await expect(page).toHaveURL(
    new RegExp(`/campaigns/${campaign.shortId}/articles/${article!.id}`)
  )

  await page.getByRole("button", { name: "Delete article" }).first().click()
  await page
    .getByRole("button", { name: "Delete article", exact: true })
    .last()
    .click()

  await expect
    .poll(async () => (await readArticle())?.deletedAt !== null)
    .toBe(true)
  await expect(page).toHaveURL(
    new RegExp(`/campaigns/${campaign.shortId}/articles$`)
  )
})
