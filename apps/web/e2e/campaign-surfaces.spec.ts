import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaigns, campaignUsers } from "@/lib/db/schema/campaign"
import { entity } from "@/lib/db/schema/entity"

import { STORAGE_STATE } from "./auth.setup"
import {
  ENCOUNTER_DM_USER_ID,
  encounterTarget,
} from "./fixtures/encounter-target"
import { cleanup, createTestCampaign, createTracker } from "./fixtures/factory"

/**
 * E2E for the campaign surfaces (UNN-329): My Campaigns, the DM manage page
 * (create campaign, invite link copy/regenerate, roster, create encounter), the
 * member overview, and the public watch-route shell.
 *
 * Signed in as the dev DM (storage-state). **Serial** because several tests
 * mutate shared rows. Mutating tests work against a **freshly created** campaign
 * (uncontended, via the UI or the factory) — never the campaigns `join.spec` /
 * `encounter-shell.spec` rely on.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

/** Campaigns this spec created via the UI, deleted after the run (cascades to
 *  their encounters + membership). */
const createdCampaignShortIds: string[] = []

/** The seed-user-owned showcase character the cascade test places + unplaces. */
const SEED_USER_ID = "seed-user"
const SEED_WARRIOR_ID = "seed-char-warrior"

/** An ephemeral seed-user-owned campaign for the member-overview / non-member-404
 *  / "Playing in" branches — uncontended, torn down in `afterAll`. */
const tracker = createTracker()
let overviewCampaign: Awaited<ReturnType<typeof createTestCampaign>>

test.beforeAll(async () => {
  overviewCampaign = await createTestCampaign(tracker, {
    dmUserId: SEED_USER_ID,
    name: "Overview Campaign",
  })
})

async function clearDevOverviewMembership(): Promise<void> {
  await getDb()
    .delete(campaignUsers)
    .where(
      and(
        eq(campaignUsers.campaignId, overviewCampaign.id),
        eq(campaignUsers.userId, ENCOUNTER_DM_USER_ID)
      )
    )
}

test.afterAll(async () => {
  await clearDevOverviewMembership()
  // Unplace the warrior in case a cascade test failed before removing it
  // (deleting its campaign below would also FK-null it, but be explicit).
  await getDb()
    .update(entity)
    .set({ campaignId: null })
    .where(eq(entity.id, SEED_WARRIOR_ID))
  for (const shortId of createdCampaignShortIds) {
    await getDb().delete(campaigns).where(eq(campaigns.shortId, shortId))
  }
  await cleanup(tracker)
})

test("My Campaigns lists the campaigns the viewer runs", async ({ page }) => {
  await page.goto("/campaigns")

  const running = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Running" }) })
  await expect(running.getByText(encounterTarget.campaignA.name)).toBeVisible()
  await expect(running.getByText(encounterTarget.campaignB.name)).toBeVisible()
})

test("create a campaign → manage page → regenerate the invite link", async ({
  page,
}) => {
  await page.goto("/campaigns")
  await page.getByRole("button", { name: "Create campaign" }).click()
  const createDialog = page.getByRole("dialog")
  await createDialog.getByLabel("Name").fill("E2E Surfaces Campaign")
  await createDialog.getByRole("button", { name: "Create campaign" }).click()

  // Lands on the manage page for the new campaign.
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/)
  await expect(
    page.getByRole("heading", { name: "E2E Surfaces Campaign" })
  ).toBeVisible()

  const shortId = page.url().split("/").pop()!
  createdCampaignShortIds.push(shortId)

  const [before] = await getDb()
    .select({ joinToken: campaigns.joinToken })
    .from(campaigns)
    .where(eq(campaigns.shortId, shortId))

  // Regenerating rotates the token.
  await page.getByRole("button", { name: "Regenerate" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Regenerate" })
    .click()
  await expect(
    page.getByText("New join link generated", { exact: false })
  ).toBeVisible()

  const [after] = await getDb()
    .select({ joinToken: campaigns.joinToken })
    .from(campaigns)
    .where(eq(campaigns.shortId, shortId))
  expect(after!.joinToken).not.toBe(before!.joinToken)
})

test("create an encounter from the manage page → DM console", async ({
  page,
}) => {
  const shortId = createdCampaignShortIds[0]!
  await page.goto(`/campaigns/${shortId}`)

  await expect(
    page.getByText("No encounters yet", { exact: false })
  ).toBeVisible()

  await page.getByRole("button", { name: "New encounter" }).click()
  const encounterDialog = page.getByRole("dialog")
  await encounterDialog.getByLabel("Name").fill("Opening skirmish")
  await encounterDialog
    .getByRole("button", { name: "Create encounter" })
    .click()

  await expect(page).toHaveURL(/\/combat\/[^/]+$/)
})

test("removing a player unplaces their characters", async ({ page }) => {
  const shortId = createdCampaignShortIds[0]!
  const [campaign] = await getDb()
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.shortId, shortId))
  const campaignId = campaign!.id

  // Seed-user joins the dev's campaign and places their warrior into it.
  await getDb()
    .insert(campaignUsers)
    .values({ campaignId, userId: SEED_USER_ID })
    .onConflictDoNothing()
  // The roster + placement surfaces read `entity.campaignId` (UNN-556).
  await getDb()
    .update(entity)
    .set({ campaignId })
    .where(eq(entity.id, SEED_WARRIOR_ID))

  await page.goto(`/campaigns/${shortId}`)
  // The roster shows the member with their placed character.
  await expect(page.getByText("Persona System Seed")).toBeVisible()
  await expect(page.getByText("Brann Holt")).toBeVisible()

  await page.getByRole("button", { name: "Remove Persona System Seed" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove" })
    .click()
  await expect(
    page.getByText("No players have joined yet", { exact: false })
  ).toBeVisible()

  // Membership is gone AND the character was unplaced — the `set null` FK does
  // not fire on a campaignUsers delete, so the explicit UPDATE is what we verify.
  const members = await getDb()
    .select()
    .from(campaignUsers)
    .where(
      and(
        eq(campaignUsers.campaignId, campaignId),
        eq(campaignUsers.userId, SEED_USER_ID)
      )
    )
  expect(members).toHaveLength(0)

  const [warrior] = await getDb()
    .select({ campaignId: entity.campaignId })
    .from(entity)
    .where(eq(entity.id, SEED_WARRIOR_ID))
  expect(warrior!.campaignId).toBeNull()
})

test("a member sees a read-only overview and the campaign shows under Playing in", async ({
  page,
}) => {
  // Make the dev user a member of the uncontended overview campaign.
  await getDb()
    .insert(campaignUsers)
    .values({
      campaignId: overviewCampaign.id,
      userId: ENCOUNTER_DM_USER_ID,
    })
    .onConflictDoNothing()

  await page.goto(`/campaigns/${overviewCampaign.shortId}`)
  await expect(
    page.getByRole("heading", { name: overviewCampaign.name })
  ).toBeVisible()
  // No DM-only invite-link control.
  await expect(page.getByText("Invite link")).toBeHidden()

  // The joined campaign appears under My Campaigns → "Playing in".
  await page.goto("/campaigns")
  const playing = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Playing in" }) })
  await expect(playing.getByText(overviewCampaign.name)).toBeVisible()

  await clearDevOverviewMembership()
})

test("a non-member 404s on the manage URL", async ({ page }) => {
  await clearDevOverviewMembership()
  const response = await page.goto(`/campaigns/${overviewCampaign.shortId}`)
  expect(response?.status()).toBe(404)
})

test("the player watch view renders a live encounter", async ({ page }) => {
  await page.goto(`/c/encounter/${encounterTarget.live.shortId}`)

  // Battlefield: the turn tracker + a combatant from the seeded live roster.
  // The owner's own-sheet column was removed with the old sheet tree (UNN-557);
  // its v2 rebuild is UNN-566 — until then the watch renders the battlefield
  // full-width for owners and spectators alike.
  await expect(page.getByRole("heading", { name: /^Round \d+$/ })).toBeVisible()
  await expect(page.getByText("Roan Vale").first()).toBeVisible()
})
