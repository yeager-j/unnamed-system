import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaigns, campaignUsers } from "@/lib/db/schema/campaign"

import { STORAGE_STATE } from "./auth.setup"
import {
  ENCOUNTER_DM_USER_ID,
  encounterTarget,
} from "./fixtures/encounter-target"

/**
 * E2E for the campaign surfaces (UNN-329): My Campaigns, the DM manage page
 * (create campaign, invite link copy/regenerate, roster, create encounter), the
 * member overview, and the public watch-route shell.
 *
 * Signed in as the dev DM (storage-state). **Serial** because several tests
 * mutate shared rows. Mutating tests work against a **freshly created** campaign
 * (uncontended) or the dedicated `overviewCampaign` seed row that no other spec
 * touches — never the campaigns `join.spec` / `encounter-shell.spec` rely on.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

/** Campaigns this spec created via the UI, deleted after the run (cascades to
 *  their encounters). */
const createdCampaignShortIds: string[] = []

async function clearDevOverviewMembership(): Promise<void> {
  await getDb()
    .delete(campaignUsers)
    .where(
      and(
        eq(campaignUsers.campaignId, encounterTarget.overviewCampaign.id),
        eq(campaignUsers.userId, ENCOUNTER_DM_USER_ID)
      )
    )
}

test.afterAll(async () => {
  await clearDevOverviewMembership()
  if (createdCampaignShortIds.length > 0) {
    await getDb()
      .delete(campaigns)
      .where(eq(campaigns.shortId, createdCampaignShortIds[0]!))
  }
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

test("a member sees a read-only overview", async ({ page }) => {
  // Make the dev user a member of the uncontended overview campaign.
  await getDb()
    .insert(campaignUsers)
    .values({
      campaignId: encounterTarget.overviewCampaign.id,
      userId: ENCOUNTER_DM_USER_ID,
    })
    .onConflictDoNothing()

  await page.goto(`/campaigns/${encounterTarget.overviewCampaign.shortId}`)
  await expect(
    page.getByRole("heading", { name: encounterTarget.overviewCampaign.name })
  ).toBeVisible()
  // No DM-only invite-link control.
  await expect(page.getByText("Invite link")).toBeHidden()

  await clearDevOverviewMembership()
})

test("a non-member 404s on the manage URL", async ({ page }) => {
  await clearDevOverviewMembership()
  const response = await page.goto(
    `/campaigns/${encounterTarget.overviewCampaign.shortId}`
  )
  expect(response?.status()).toBe(404)
})

test("the watch-route shell renders for an encounter shortId", async ({
  page,
}) => {
  await page.goto(`/c/encounter/${encounterTarget.live.shortId}`)
  await expect(page.getByTestId("encounter-watch-stub")).toBeVisible()
})
