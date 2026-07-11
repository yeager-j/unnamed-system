import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { ENCOUNTER_DM_USER_ID } from "./fixtures/encounter-target"
import {
  cleanup,
  createLiveEncounter,
  createTestCampaign,
  createTestCharacter,
  createTracker,
  placeCharacter,
} from "./fixtures/factory"

/**
 * E2E for the catalog browse-and-add surface (UNN-346): `/campaigns/{c}/encounter/{e}/setup`.
 * Signed in as the dev DM (storage-state). Each test mints its own ephemeral
 * campaign + draft/live encounter via the factory (UNN-343) — unique ids, zero
 * seed footprint, cleaned up in `afterAll` — so the spec is contention-free and
 * needs no `serial`.
 */
test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
let campaign: Awaited<ReturnType<typeof createTestCampaign>>
let pc: Awaited<ReturnType<typeof createTestCharacter>>

test.beforeAll(async () => {
  campaign = await createTestCampaign(tracker, {
    dmUserId: ENCOUNTER_DM_USER_ID,
    name: "Catalog Enemies Spec",
  })
  pc = await createTestCharacter(tracker, { name: "Brannis Vael" })
  await placeCharacter(pc.id, campaign.id)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test("browse the catalog, queue two Goblins, and add them to the encounter", async ({
  page,
}) => {
  // A draft encounter already holding the placed PC — catalog adds append to it.
  const encounter = await createLiveEncounter(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
    status: "draft",
    combatantCharacterIds: [pc.id],
  })

  await page.goto(encounter.url)
  await page.getByRole("button", { name: "Browse catalog" }).click()
  await expect(page).toHaveURL(/\/encounter\/[^/]+\/setup$/)

  // Search narrows the master list; the detail pane shows the Goblin statblock.
  await page
    .getByRole("textbox", { name: "Search the bestiary" })
    .fill("Goblin")
  await expect(
    page.getByRole("heading", { name: "Goblin", exact: true })
  ).toBeVisible()

  // Queue two Goblins, then commit — the rail total tracks the staged count.
  const queueGoblin = page
    .getByRole("button", { name: "Queue Goblin", exact: true })
    .first()
  await queueGoblin.click()
  await queueGoblin.click()
  await expect(page.getByText("Total enemies")).toBeVisible()
  await page.getByRole("button", { name: "Add to encounter" }).click()

  // Back on setup, the roster gained two numbered Goblins beside the PC.
  await expect(page).toHaveURL(new RegExp(`/encounter/${encounter.shortId}$`))
  await expect(page.getByText("Combatants (3)")).toBeVisible()
  await expect(page.getByText("Goblin 2")).toBeVisible()
})

test("a non-draft encounter redirects away from the catalog", async ({
  page,
}) => {
  const live = await createLiveEncounter(tracker, {
    campaignId: campaign.id,
    campaignShortId: campaign.shortId,
    combatantCharacterIds: [pc.id],
  })

  await page.goto(`${live.url}/setup`)
  await expect(page).toHaveURL(new RegExp(`/encounter/${live.shortId}$`))
})
