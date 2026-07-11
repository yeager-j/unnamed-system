import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaigns, campaignUsers } from "@/lib/db/schema/campaign"
import { entity } from "@/lib/db/schema/entity"

import { STORAGE_STATE } from "./auth.setup"
import {
  cleanup,
  createLiveEncounter,
  createTestCampaign,
  createTestCharacter,
  createTracker,
  placeCharacter,
} from "./fixtures/factory"

/**
 * E2E for the campaign lifecycle cascades + live-locks (UNN-330): leave, delete
 * campaign, and the live-encounter lock on delete-character / delete-campaign /
 * member removal. Signed in as the dev user. Every test mints its own world
 * (character + campaign[s] + encounters) via the factory with unique-per-run
 * ids, and `afterEach` tears it all down — so nothing races the placement /
 * surfaces / encounter specs.
 *
 * The member live-lock guard (`memberHasLiveEncounterCombatant`) is exercised
 * via the **leave** path here; kick shares the same guard and write, and its
 * happy path is covered by `campaign-surfaces.spec`.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const DEV_ID = "dev-user-claude"
const SEED_USER_ID = "seed-user"

const tracker = createTracker()
let char: Awaited<ReturnType<typeof createTestCharacter>>

test.beforeEach(async () => {
  char = await createTestCharacter(tracker, { name: "Tamsin Roe" })
})

test.afterEach(async () => {
  await cleanup(tracker)
})

async function readCharCampaignId(): Promise<string | null> {
  const [row] = await getDb()
    .select({ campaignId: entity.campaignId })
    .from(entity)
    .where(eq(entity.id, char.id))
  return row!.campaignId
}

async function isMember(campaignId: string, userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ userId: campaignUsers.userId })
    .from(campaignUsers)
    .where(eq(campaignUsers.campaignId, campaignId))
  return rows.some((r) => r.userId === userId)
}

test("a member can leave — membership gone, characters unplaced", async ({
  page,
}) => {
  const campaign = await createTestCampaign(tracker, { dmUserId: SEED_USER_ID })
  await getDb()
    .insert(campaignUsers)
    .values({ campaignId: campaign.id, userId: DEV_ID })
    .onConflictDoNothing()
  await placeCharacter(char.id, campaign.id)

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Leave campaign" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Leave" })
    .click()

  await expect(page).toHaveURL("/campaigns")
  expect(await isMember(campaign.id, DEV_ID)).toBe(false)
  expect(await readCharCampaignId()).toBeNull()
})

test("leaving is blocked while a character is a live combatant", async ({
  page,
}) => {
  const campaign = await createTestCampaign(tracker, { dmUserId: SEED_USER_ID })
  await getDb()
    .insert(campaignUsers)
    .values({ campaignId: campaign.id, userId: DEV_ID })
    .onConflictDoNothing()
  await placeCharacter(char.id, campaign.id)
  await createLiveEncounter(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
    combatantCharacterIds: [char.id],
  })

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Leave campaign" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Leave" })
    .click()

  await expect(
    page.getByText("active encounter", { exact: false })
  ).toBeVisible()
  expect(await isMember(campaign.id, DEV_ID)).toBe(true)
})

test("a DM can delete a campaign — it's gone and characters are unplaced", async ({
  page,
}) => {
  const campaign = await createTestCampaign(tracker, { dmUserId: DEV_ID })
  await placeCharacter(char.id, campaign.id)

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Delete campaign" }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("textbox").fill(campaign.name)
  await dialog.getByRole("button", { name: "Delete forever" }).click()

  await expect(page).toHaveURL("/campaigns")
  const remaining = await getDb()
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaign.id))
  expect(remaining).toHaveLength(0)
  // The set-null FK unplaced the character.
  expect(await readCharCampaignId()).toBeNull()
})

test("campaign deletion is blocked while a live encounter exists", async ({
  page,
}) => {
  const campaign = await createTestCampaign(tracker, { dmUserId: DEV_ID })
  await createLiveEncounter(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
  })

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Delete campaign" }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("textbox").fill(campaign.name)
  await dialog.getByRole("button", { name: "Delete forever" }).click()

  await expect(
    page.getByText("End the live encounter", { exact: false })
  ).toBeVisible()
  const remaining = await getDb()
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaign.id))
  expect(remaining).toHaveLength(1)
})

test("a live-combatant character cannot be deleted", async ({ page }) => {
  const campaign = await createTestCampaign(tracker, { dmUserId: DEV_ID })
  await placeCharacter(char.id, campaign.id)
  await createLiveEncounter(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
    combatantCharacterIds: [char.id],
  })

  await openDeleteCharacterDialog(page)
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("textbox").fill(char.name)
  await dialog.getByRole("button", { name: "Delete forever" }).click()

  await expect(
    page.getByText("active encounter", { exact: false })
  ).toBeVisible()
  // Still present.
  const rows = await getDb()
    .select({ id: entity.id })
    .from(entity)
    .where(eq(entity.id, char.id))
  expect(rows).toHaveLength(1)
})

/** Opens the delete dialog for the test character from its My Characters card. */
async function openDeleteCharacterDialog(page: Page) {
  await page.goto("/")
  const card = page.locator("[data-slot=card]").filter({ hasText: char.name })
  await card.getByRole("button", { name: `Actions for ${char.name}` }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
}
