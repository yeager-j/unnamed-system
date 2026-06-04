import { expect, test, type Page } from "@playwright/test"
import { eq, inArray } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaigns, campaignUsers } from "@/lib/db/schema/campaign"
import { characters } from "@/lib/db/schema/character"
import { encounters } from "@/lib/db/schema/encounter"
import { createCombatSession } from "@/lib/game/encounter"

import { STORAGE_STATE } from "./auth.setup"
import { encounterTarget } from "./fixtures/encounter-target"

/**
 * E2E for the campaign lifecycle cascades + live-locks (UNN-330): leave, delete
 * campaign, and the live-encounter lock on delete-character / delete-campaign /
 * member removal. Signed in as the dev user, who owns the dedicated
 * `lifecycleChar`. Every campaign is created in-test with a `lifecycle-` id so
 * nothing races the placement / surfaces / encounter specs; `beforeEach` resets
 * the created rows + the character's placement.
 *
 * The member live-lock guard (`memberHasLiveEncounterCombatant`) is exercised via
 * the **leave** path here; kick shares the same guard and write, and its happy
 * path is covered by `campaign-surfaces.spec`.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const DEV_ID = "dev-user-claude"
const SEED_USER_ID = "seed-user"
const CHAR_ID = encounterTarget.lifecycleChar.characterId
const CHAR_NAME = encounterTarget.lifecycleChar.seed.name

const CAMPAIGN_IDS = [
  "seed-campaign-lc-leave",
  "seed-campaign-lc-delete",
  "seed-campaign-lc-delete-live",
  "seed-campaign-lc-charlock",
] as const
const ENCOUNTER_IDS = [
  "seed-encounter-lc-live",
  "seed-encounter-lc-charlock",
] as const

interface MadeCampaign {
  id: string
  shortId: string
}

async function makeCampaign(
  id: string,
  dmUserId: string
): Promise<MadeCampaign> {
  const shortId = id.replace("seed-campaign-", "")
  const row = {
    id,
    shortId,
    joinToken: `join-${shortId}`,
    dmUserId,
    name: `Lifecycle ${shortId}`,
  }
  await getDb()
    .insert(campaigns)
    .values(row)
    .onConflictDoUpdate({ target: campaigns.id, set: row })
  return { id, shortId }
}

async function placeLifecycleChar(campaignId: string | null): Promise<void> {
  await getDb()
    .update(characters)
    .set({ campaignId })
    .where(eq(characters.id, CHAR_ID))
}

async function makeLiveEncounter(
  id: string,
  campaignId: string,
  combatantCharacterId?: string
): Promise<void> {
  const setups = combatantCharacterId
    ? [
        {
          side: "players" as const,
          ref: { kind: "pc" as const, characterId: combatantCharacterId },
          zoneId: "",
        },
      ]
    : []
  await getDb()
    .insert(encounters)
    .values({
      id,
      shortId: id.replace("seed-encounter-", ""),
      campaignId,
      name: "Lifecycle encounter",
      status: "live",
      session: createCombatSession(setups, () => `${id}-c0`),
      version: 0,
    })
    .onConflictDoNothing()
}

async function readCharCampaignId(): Promise<string | null> {
  const [row] = await getDb()
    .select({ campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, CHAR_ID))
  return row!.campaignId
}

async function isMember(campaignId: string, userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ userId: campaignUsers.userId })
    .from(campaignUsers)
    .where(eq(campaignUsers.campaignId, campaignId))
  return rows.some((r) => r.userId === userId)
}

async function resetLifecycle(): Promise<void> {
  await getDb()
    .delete(encounters)
    .where(inArray(encounters.id, [...ENCOUNTER_IDS]))
  await getDb()
    .delete(campaigns)
    .where(inArray(campaigns.id, [...CAMPAIGN_IDS]))
  await placeLifecycleChar(null)
}

test.beforeEach(resetLifecycle)
test.afterAll(resetLifecycle)

test("a member can leave — membership gone, characters unplaced", async ({
  page,
}) => {
  const campaign = await makeCampaign(CAMPAIGN_IDS[0], SEED_USER_ID)
  await getDb()
    .insert(campaignUsers)
    .values({ campaignId: campaign.id, userId: DEV_ID })
    .onConflictDoNothing()
  await placeLifecycleChar(campaign.id)

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
  const campaign = await makeCampaign(CAMPAIGN_IDS[0], SEED_USER_ID)
  await getDb()
    .insert(campaignUsers)
    .values({ campaignId: campaign.id, userId: DEV_ID })
    .onConflictDoNothing()
  await placeLifecycleChar(campaign.id)
  await makeLiveEncounter(ENCOUNTER_IDS[0], campaign.id, CHAR_ID)

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
  const campaign = await makeCampaign(CAMPAIGN_IDS[1], DEV_ID)
  await placeLifecycleChar(campaign.id)

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Delete campaign" }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("textbox").fill(`Lifecycle ${campaign.shortId}`)
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
  const campaign = await makeCampaign(CAMPAIGN_IDS[2], DEV_ID)
  await makeLiveEncounter(ENCOUNTER_IDS[0], campaign.id)

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Delete campaign" }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("textbox").fill(`Lifecycle ${campaign.shortId}`)
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
  const campaign = await makeCampaign(CAMPAIGN_IDS[3], DEV_ID)
  await placeLifecycleChar(campaign.id)
  await makeLiveEncounter(ENCOUNTER_IDS[1], campaign.id, CHAR_ID)

  await openDeleteCharacterDialog(page)
  const dialog = page.getByRole("alertdialog")
  await dialog.getByRole("textbox").fill(CHAR_NAME)
  await dialog.getByRole("button", { name: "Delete forever" }).click()

  await expect(
    page.getByText("active encounter", { exact: false })
  ).toBeVisible()
  // Still present.
  const rows = await getDb()
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, CHAR_ID))
  expect(rows).toHaveLength(1)
})

/** Opens the delete dialog for `lifecycleChar` from its My Characters card menu. */
async function openDeleteCharacterDialog(page: Page) {
  await page.goto("/")
  const card = page.locator("[data-slot=item]").filter({ hasText: CHAR_NAME })
  await card.getByRole("button", { name: `Actions for ${CHAR_NAME}` }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
}
