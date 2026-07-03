import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { createDungeonCombatTarget } from "./fixtures/dungeon-combat-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * E2E for the dungeon combat cutover (UNN-536, PR11c) — the delve's full combat
 * phase on engine v2. Signed in as the dev user (DM of the ephemeral campaign), it
 * drives the shipped flow end-to-end: from exploration, **Start an encounter**
 * (stage an enemy → Begin) mints a live encounter on the delve's shared Instance;
 * **End encounter** prunes the fight and advances the delve turn. Every assertion
 * reads the persisted round-trip **through the DB** (per e2e/CLAUDE.md — a Server
 * Action + `revalidatePath` write isn't settled at `networkidle`), so it locks the
 * atomic three-row end (encounter ended, dungeon turn +1, enemy token pruned, PC
 * token in place — R23.3) against regression.
 *
 * **Serial** (the one test mutates the shared delve); `afterAll` tears the world
 * down — the factory sweeps the app-created encounter off the tracked Instance.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createDungeonCombatTarget>>

test.beforeAll(async () => {
  target = await createDungeonCombatTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test("runs a delve's full combat phase: begin → end, atomic + PC in place", async ({
  page,
}) => {
  await page.goto(target.dungeon.url)

  // Exploration baseline: the PC stands alone on the delve map, no live fight.
  expect(await target.getLiveEncounter()).toBeNull()
  expect(await target.getDungeonTurn()).toBe(0)

  // Start an encounter — stage one enemy onto a zone, then Begin.
  await page.getByRole("button", { name: "Start an encounter" }).click()
  const dialog = page.getByRole("dialog", { name: "Start an encounter" })
  await expect(dialog).toBeVisible()

  await dialog.getByRole("combobox").first().click()
  await page.getByRole("option").first().click()
  await dialog.getByRole("button", { name: "Stage enemy" }).click()
  await dialog.getByRole("button", { name: "Begin encounter" }).click()

  // The mint is a Server-Action write; poll the DB, not networkidle.
  await expect.poll(async () => await target.getLiveEncounter()).not.toBeNull()

  // The page re-forks to the combat console: the enemy token joined the Instance
  // (PC + enemy = 2), and the End-encounter control is live.
  await expect
    .poll(async () => (await target.getOccupancyKeys()).length)
    .toBe(2)
  const endButton = page.getByRole("button", { name: "End encounter" })
  await expect(endButton).toBeVisible()

  // End the fight — confirm the dialog (the AlertDialogAction shares the label).
  await endButton.click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "End encounter" })
    .click()

  // The composed three-row end, asserted through the DB: the encounter is no
  // longer live, the delve turn advanced by one, and the Instance is pruned back
  // to just the PC token — standing where the fight ended (R23.3 parity).
  await expect.poll(async () => await target.getLiveEncounter()).toBeNull()
  await expect.poll(async () => await target.getDungeonTurn()).toBe(1)
  const keys = await target.getOccupancyKeys()
  expect(keys).toEqual([target.pc.id])
})
