import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaignArticle, campaignNpc } from "@/lib/db/schema/campaign-world"
import { entity } from "@/lib/db/schema/entity"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTestCampaign, createTracker } from "./fixtures/factory"

/**
 * E2E for the world substrate (UNN-575): the NPC dual-mint through the
 * linker's quick-mint row, the stub badge, and the tombstone deletes — the
 * real-DB proof vitest can't give (tx atomicity, the shared-id mint, the
 * lineage-returns-to-the-deck clear). Serial: the delete tests consume the
 * rows the mint tests create.
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

test("quick-mints an NPC from the linker in one gesture — dual-mint + stub badge", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/npcs`)
  await page.getByRole("button", { name: "New NPC" }).click()
  await page.getByPlaceholder("Link an NPC, Article, or place…").fill(NPC_NAME)
  await page.getByText(new RegExp(`Create .${NPC_NAME}. as NPC`)).click()

  // The list row appears with the stub badge (name only — nothing authored).
  await expect(page.getByText(NPC_NAME)).toBeVisible()
  await expect(page.getByText("Stub", { exact: true })).toBeVisible()

  // The dual-mint persisted: a subtype row whose id is a live entity's id.
  await expect.poll(async () => (await readNpc()) !== null).toBe(true)
  const npc = await readNpc()
  expect(npc!.deletedAt).toBeNull()
})

test("deleting the NPC tombstones the entity and returns the Lineage to the deck", async ({
  page,
}) => {
  // Author traits directly on the subtype (the pickers are phase 6) so the
  // delete has something to clear.
  const npc = await readNpc()
  await getDb()
    .update(campaignNpc)
    .set({ arcana: "The Moon", lineageKey: "warlock" })
    .where(eq(campaignNpc.entityId, npc!.entityId))

  await page.goto(`/campaigns/${campaign.shortId}/npcs`)
  await page.getByRole("button", { name: `Delete ${NPC_NAME}` }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()

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

  // Tombstones leave the list — its delete affordance is the unambiguous
  // absence probe (toasts and the closing dialog also carry the name).
  await expect(
    page.getByRole("button", { name: `Delete ${NPC_NAME}` })
  ).toBeHidden()
})

test("quick-mints an Article and tombstones it", async ({ page }) => {
  await page.goto(`/campaigns/${campaign.shortId}/articles`)
  await page.getByRole("button", { name: "New Article" }).click()
  await page
    .getByPlaceholder("Link an NPC, Article, or place…")
    .fill(ARTICLE_NAME)
  await page.getByText("…as Article").click()

  await expect(page.getByText(ARTICLE_NAME)).toBeVisible()
  await expect.poll(async () => (await readArticle()) !== null).toBe(true)

  await page.getByRole("button", { name: `Delete ${ARTICLE_NAME}` }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()

  await expect
    .poll(async () => (await readArticle())?.deletedAt !== null)
    .toBe(true)
  await expect(
    page.getByRole("button", { name: `Delete ${ARTICLE_NAME}` })
  ).toBeHidden()
})
