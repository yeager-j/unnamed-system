import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaignUsers } from "@/lib/db/schema/campaign"

import { STORAGE_STATE } from "./auth.setup"
import {
  ENCOUNTER_DM_USER_ID,
  encounterTarget,
} from "./fixtures/encounter-target"

/**
 * E2E for the join-link flow (UNN-327): the public `/join/{token}` page and its
 * five states. The seeded dev user is the DM of Campaign A (`join-playtest`) and
 * a non-member of the foreign campaign (`join-foreign`, DM = seed-user), so a
 * single signed-in session exercises both the "you're the DM" branch and the
 * "join → already in" branch. The OAuth round-trip itself is verified manually
 * (it leaves the app), so the signed-out test asserts only that the prompt
 * renders.
 *
 * **Serial** so the join test's membership write/cleanup never races a parallel
 * read of the same `(campaign, user)` row.
 */
test.describe.configure({ mode: "serial" })

/** The foreign campaign's membership for the dev user — created by the join test,
 *  and reset before/after so re-runs start from "not a member". */
async function clearDevForeignMembership(): Promise<void> {
  await getDb()
    .delete(campaignUsers)
    .where(
      and(
        eq(campaignUsers.campaignId, encounterTarget.foreignCampaign.id),
        eq(campaignUsers.userId, ENCOUNTER_DM_USER_ID)
      )
    )
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("renders the sign-in prompt for a valid token", async ({ page }) => {
    await page.goto(`/join/${encounterTarget.campaignA.joinToken}`)
    await expect(page.getByText(encounterTarget.campaignA.name)).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Sign in with Google to join" })
    ).toBeVisible()
  })

  test("shows the stale-link message for an unknown token (HTTP 200)", async ({
    page,
  }) => {
    const response = await page.goto("/join/this-token-does-not-exist")
    expect(response?.status()).toBe(200)
    await expect(page.getByText("This link is no longer valid")).toBeVisible()
  })
})

test.describe("signed in", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await clearDevForeignMembership()
  })

  test.afterAll(async () => {
    await clearDevForeignMembership()
  })

  test("the campaign's DM is not added as a member", async ({ page }) => {
    await page.goto(`/join/${encounterTarget.campaignA.joinToken}`)
    await expect(
      page.getByText("You're the DM of this campaign.")
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Join campaign" })
    ).toBeHidden()

    const rows = await getDb()
      .select()
      .from(campaignUsers)
      .where(
        and(
          eq(campaignUsers.campaignId, encounterTarget.campaignA.id),
          eq(campaignUsers.userId, ENCOUNTER_DM_USER_ID)
        )
      )
    expect(rows).toHaveLength(0)
  })

  test("a non-member joins, idempotently", async ({ page }) => {
    await page.goto(`/join/${encounterTarget.foreignCampaign.joinToken}`)
    await page.getByRole("button", { name: "Join campaign" }).click()
    await expect(
      page.getByText("You're already in this campaign.")
    ).toBeVisible()

    // Re-visiting the link is a no-op, not an error (reusable-link case).
    await page.reload()
    await expect(
      page.getByText("You're already in this campaign.")
    ).toBeVisible()

    const rows = await getDb()
      .select()
      .from(campaignUsers)
      .where(
        and(
          eq(campaignUsers.campaignId, encounterTarget.foreignCampaign.id),
          eq(campaignUsers.userId, ENCOUNTER_DM_USER_ID)
        )
      )
    expect(rows).toHaveLength(1)
  })
})
