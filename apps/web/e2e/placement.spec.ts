import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { characters } from "@/lib/db/schema/character"
import { encounters } from "@/lib/db/schema/encounter"
import { createCombatSession } from "@/lib/game/encounter"
import {
  CHARACTER_PLACEMENT_CONSENT,
  CHARACTER_UNPLACE_CONSENT,
} from "@/lib/ui/labels"

import { STORAGE_STATE } from "./auth.setup"
import { encounterTarget } from "./fixtures/encounter-target"

/**
 * E2E for character placement / move / unplace (UNN-328). Signed in as the dev
 * user, who owns the dedicated, finalized `placementChar` and is the DM of the
 * uncontended `placementCampaign` — so this spec moves that one character around
 * (via the Add-character combobox dialog + the per-card remove control) without
 * disturbing the encounter/import specs that depend on `placedPc` sitting in
 * Campaign A. **Serial**; each test arranges its own start placement via a DB
 * poke and `beforeEach` resets the character to unplaced + clears the live
 * encounter the lock test creates.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const CHAR_ID = encounterTarget.placementChar.characterId
const CHAR_NAME = encounterTarget.placementChar.seed.name
const CAMPAIGN = encounterTarget.placementCampaign
const LIVE_ENCOUNTER_ID = "seed-encounter-placement-live"

async function setPlacement(campaignId: string | null): Promise<void> {
  await getDb()
    .update(characters)
    .set({ campaignId })
    .where(eq(characters.id, CHAR_ID))
}

async function readPlacement(): Promise<string | null> {
  const [row] = await getDb()
    .select({ campaignId: characters.campaignId })
    .from(characters)
    .where(eq(characters.id, CHAR_ID))
  return row!.campaignId
}

async function clearLiveEncounter(): Promise<void> {
  await getDb().delete(encounters).where(eq(encounters.id, LIVE_ENCOUNTER_ID))
}

/** The placed-character card for the dedicated character (an `Item`, not an
 *  `li`). */
function charCard(page: Page) {
  return page.locator("[data-slot=item]").filter({ hasText: CHAR_NAME })
}

/** Opens the Add-character dialog and picks the dedicated character via the
 *  inline `Command` list (search + click). Returns the dialog so the caller can
 *  assert its consent copy / pick the confirm button. */
async function pickInAddDialog(page: Page) {
  await page.getByRole("button", { name: "Add character" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByPlaceholder(/Search your characters/).fill(CHAR_NAME)
  await dialog
    .locator("[data-slot=command-item]")
    .filter({ hasText: CHAR_NAME })
    .first()
    .click()
  return dialog
}

test.beforeEach(async () => {
  await clearLiveEncounter()
  await setPlacement(null)
})

test.afterAll(async () => {
  await clearLiveEncounter()
  await setPlacement(null)
})

test("adds an unplaced character, stating the consent", async ({ page }) => {
  await page.goto(`/campaigns/${CAMPAIGN.shortId}`)

  const dialog = await pickInAddDialog(page)
  await expect(dialog.getByText(CHARACTER_PLACEMENT_CONSENT)).toBeVisible()
  await dialog.getByRole("button", { name: "Add" }).click()

  await expect(charCard(page)).toBeVisible()
  expect(await readPlacement()).toBe(CAMPAIGN.id)
})

test("removes a placed character, stating the reverse consent", async ({
  page,
}) => {
  await setPlacement(CAMPAIGN.id)
  await page.goto(`/campaigns/${CAMPAIGN.shortId}`)

  await charCard(page)
    .getByRole("button", { name: `Remove ${CHAR_NAME} from campaign` })
    .click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByText(CHARACTER_UNPLACE_CONSENT)).toBeVisible()
  await dialog.getByRole("button", { name: "Remove" }).click()

  await expect(charCard(page)).toBeHidden()
  expect(await readPlacement()).toBeNull()
})

test("moves a character placed in another campaign", async ({ page }) => {
  // Pre-place in the (seed-user) overview campaign, then move it here.
  await setPlacement(encounterTarget.overviewCampaign.id)
  await page.goto(`/campaigns/${CAMPAIGN.shortId}`)

  const dialog = await pickInAddDialog(page)
  // The dialog surfaces the single-campaign move confirmation — naming the prior
  // campaign — before the owner commits.
  await expect(
    dialog.getByText(
      `This character is currently in ${encounterTarget.overviewCampaign.name}`,
      { exact: false }
    )
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Move here" }).click()

  await expect(charCard(page)).toBeVisible()
  expect(await readPlacement()).toBe(CAMPAIGN.id)
})

test("refuses to remove a character that is live in combat", async ({
  page,
}) => {
  await setPlacement(CAMPAIGN.id)
  // A live encounter in this campaign with the character as a combatant.
  await getDb()
    .insert(encounters)
    .values({
      id: LIVE_ENCOUNTER_ID,
      shortId: "placement-live",
      campaignId: CAMPAIGN.id,
      name: "Locked encounter",
      status: "live",
      session: createCombatSession([
        {
          side: "players",
          ref: { kind: "pc", characterId: CHAR_ID },
          zoneId: "",
        },
      ]),
      version: 0,
    })

  await page.goto(`/campaigns/${CAMPAIGN.shortId}`)
  await charCard(page)
    .getByRole("button", { name: `Remove ${CHAR_NAME} from campaign` })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove" })
    .click()

  await expect(
    page.getByText("active encounter", { exact: false })
  ).toBeVisible()
  // Still placed — the lock held.
  expect(await readPlacement()).toBe(CAMPAIGN.id)
})
