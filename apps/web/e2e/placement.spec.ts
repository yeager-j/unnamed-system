import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { encounters } from "@/lib/db/schema/encounter"
import { entity } from "@/lib/db/schema/entity"
import {
  CHARACTER_PLACEMENT_CONSENT,
  CHARACTER_UNPLACE_CONSENT,
} from "@/lib/ui/labels"

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
 * E2E for character placement / move / unplace (UNN-328). Signed in as the dev
 * user, who owns an ephemeral, finalized character and is the DM of an ephemeral
 * campaign — so this spec moves that one character around (via the Add-character
 * combobox dialog + the per-card remove control) without disturbing any other
 * spec. **Serial**; each test arranges its own start placement via a DB poke and
 * `beforeEach` resets the character to unplaced + clears the live encounter the
 * lock test creates. `afterAll` tears the whole world down.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const DEV_ID = "dev-user-claude"

const tracker = createTracker()
let char: Awaited<ReturnType<typeof createTestCharacter>>
let campaign: Awaited<ReturnType<typeof createTestCampaign>>
let otherCampaign: Awaited<ReturnType<typeof createTestCampaign>>

test.beforeAll(async () => {
  char = await createTestCharacter(tracker, { name: "Pelle Quist" })
  campaign = await createTestCampaign(tracker, {
    dmUserId: DEV_ID,
    name: "Placement Campaign",
  })
  otherCampaign = await createTestCampaign(tracker, {
    dmUserId: DEV_ID,
    name: "Origin Campaign",
  })
})

async function readPlacement(): Promise<string | null> {
  const [row] = await getDb()
    .select({ campaignId: entity.campaignId })
    .from(entity)
    .where(eq(entity.id, char.id))
  return row!.campaignId
}

async function clearCampaignEncounters(): Promise<void> {
  await getDb().delete(encounters).where(eq(encounters.campaignId, campaign.id))
}

/** The placed-character card for the dedicated character (an `Item`, not an
 *  `li`). */
function charCard(page: Page) {
  return page.locator("[data-slot=item]").filter({ hasText: char.name })
}

/** Opens the Add-character dialog and picks the dedicated character via the
 *  inline `Command` list (search + click). Returns the dialog so the caller can
 *  assert its consent copy / pick the confirm button. */
async function pickInAddDialog(page: Page) {
  await page.getByRole("button", { name: "Add character" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByPlaceholder(/Search your characters/).fill(char.name)
  await dialog
    .locator("[data-slot=command-item]")
    .filter({ hasText: char.name })
    .first()
    .click()
  return dialog
}

test.beforeEach(async () => {
  await clearCampaignEncounters()
  await placeCharacter(char.id, null)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test("adds an unplaced character, stating the consent", async ({ page }) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  const dialog = await pickInAddDialog(page)
  await expect(dialog.getByText(CHARACTER_PLACEMENT_CONSENT)).toBeVisible()
  await dialog.getByRole("button", { name: "Add" }).click()

  await expect(charCard(page)).toBeVisible()
  expect(await readPlacement()).toBe(campaign.id)
})

test("removes a placed character, stating the reverse consent", async ({
  page,
}) => {
  await placeCharacter(char.id, campaign.id)
  await page.goto(`/campaigns/${campaign.shortId}`)

  await charCard(page)
    .getByRole("button", { name: `Remove ${char.name} from campaign` })
    .click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByText(CHARACTER_UNPLACE_CONSENT)).toBeVisible()
  await dialog.getByRole("button", { name: "Remove" }).click()

  await expect(charCard(page)).toBeHidden()
  expect(await readPlacement()).toBeNull()
})

test("moves a character placed in another campaign", async ({ page }) => {
  // Pre-place in the other campaign, then move it here.
  await placeCharacter(char.id, otherCampaign.id)
  await page.goto(`/campaigns/${campaign.shortId}`)

  const dialog = await pickInAddDialog(page)
  // The dialog surfaces the single-campaign move confirmation — naming the prior
  // campaign — before the owner commits.
  await expect(
    dialog.getByText(`This character is currently in ${otherCampaign.name}`, {
      exact: false,
    })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Move here" }).click()

  await expect(charCard(page)).toBeVisible()
  expect(await readPlacement()).toBe(campaign.id)
})

test("refuses to remove a character that is live in combat", async ({
  page,
}) => {
  await placeCharacter(char.id, campaign.id)
  // A live encounter in this campaign with the character as a combatant.
  await createLiveEncounter(tracker, {
    campaignId: campaign.id,
    combatantCharacterIds: [char.id],
  })

  await page.goto(`/campaigns/${campaign.shortId}`)
  await charCard(page)
    .getByRole("button", { name: `Remove ${char.name} from campaign` })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove" })
    .click()

  await expect(
    page.getByText("active encounter", { exact: false })
  ).toBeVisible()
  // Still placed — the lock held.
  expect(await readPlacement()).toBe(campaign.id)
})
