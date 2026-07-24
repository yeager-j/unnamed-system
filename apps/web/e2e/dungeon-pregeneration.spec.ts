import { expect, test, type Page } from "@playwright/test"

import { DEFAULT_PREGEN_MAX_DEPTH } from "@workspace/game-v2/generation"

import { STORAGE_STATE } from "./auth.setup"
import {
  createDungeonExpansionTarget,
  CRYPT_TEMPLATE,
  ENTRY,
  MONOLITH,
  MONOLITH_TEMPLATE,
  OSSUARY_TEMPLATE,
} from "./fixtures/dungeon-expansion-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * The UNN-642 pre-generation, end to end: starting an expedition
 * **pre-generates the map out to the depth limit** server-side (no per-room
 * click, no per-carve turn cost), then **leaves the outer ring's frontier
 * open** so the DM can still expand further live via the ghost buttons. This
 * spec drives a real start through the console and asserts the persisted map
 * (DB polling per the write-then-read doctrine) plus the open frontier.
 */

test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createDungeonExpansionTarget>>

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createDungeonExpansionTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function mintExpeditionDraft(page: Page, name: string) {
  await page.goto(target.region.url)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "New expedition" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Name").fill(name)
  await dialog.getByRole("button", { name: "Start expedition" }).click()

  await page.waitForURL(/\/dungeon\//)
  await page.waitForLoadState("networkidle")
}

async function mintAndStartExpedition(page: Page, name: string) {
  await mintExpeditionDraft(page, name)
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: ENTRY.name }).click()

  const ossuary = page
    .getByRole("checkbox", { name: OSSUARY_TEMPLATE.name })
    .locator("xpath=ancestor::li")
  await expect(
    ossuary.getByRole("checkbox", { name: OSSUARY_TEMPLATE.name })
  ).toBeChecked()
  await expect(ossuary.getByLabel("Minimum depth")).toHaveValue("2")
  await expect(ossuary.getByRole("combobox")).toHaveText(/This session/)
  await expect(
    page.getByRole("checkbox", { name: CRYPT_TEMPLATE.name })
  ).not.toBeChecked()
  const authored = page
    .getByRole("checkbox", { name: MONOLITH_TEMPLATE.name })
    .locator("xpath=ancestor::li")
  await expect(
    authored.getByRole("checkbox", { name: MONOLITH_TEMPLATE.name })
  ).toBeChecked()
  await expect(
    authored.getByRole("checkbox", { name: MONOLITH_TEMPLATE.name })
  ).toBeDisabled()
  await expect(authored.getByText("Already on map")).toBeVisible()

  await page.getByRole("button", { name: "Start expedition" }).click()

  await expect(page.getByRole("button", { name: "Advance turn" })).toBeVisible()
}

async function openQueueSiteMenu(page: Page) {
  await page.locator(`[data-id="${ENTRY.id}"]`).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Queue site…" }).hover()
}

async function closeNestedMenu(page: Page) {
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
}

test("starting an expedition pre-generates the map to depth with an open frontier at turn 0", async ({
  page,
}) => {
  await mintAndStartExpedition(page, "Pre-generated Expedition")

  const [expedition] = await target.getExpeditions()
  expect(expedition).toBeDefined()
  expect(expedition!.status).toBe("active")

  // The whole map is carved at start — many zones, not the one authored Entry.
  const started = await target.getInstanceState(expedition!.mapInstanceId)
  const zones = Object.values(started.geometry.zones)
  expect(zones.length).toBeGreaterThanOrEqual(6)

  // Nothing is carved past the depth limit (rings out from the entrance).
  const depths = Object.values(started.generation.zones).map((p) => p.depth)
  expect(Math.max(...depths)).toBeLessThanOrEqual(DEFAULT_PREGEN_MAX_DEPTH)

  // Every zone but the two authored seed zones was generated, and each recorded
  // a mint.
  const generated = Object.entries(started.generation.zones).filter(
    ([, provenance]) => provenance.source === "generated"
  )
  expect(generated.length).toBe(zones.length - 2)
  const dungeonState = await target.getDungeonState(expedition!.id)
  for (const [zoneId] of generated) {
    expect(dungeonState.generation.mints[zoneId]).toBeDefined()
  }

  // The frontier stays open — the outer ring's stubs are the live edge, each
  // hanging off a max-depth zone.
  const openStubs = Object.values(started.generation.stubs)
  expect(openStubs.length).toBeGreaterThan(0)
  for (const stub of openStubs) {
    expect(started.generation.zones[stub.zoneId]?.depth).toBe(
      Math.max(...depths)
    )
  }

  // Pre-generation cost no dungeon turns — play begins at turn 0.
  expect(dungeonState.turnCounter).toBe(0)
  expect(
    dungeonState.generation.declarations.find(
      (item) => item.templateKey === MONOLITH_TEMPLATE.key
    )?.resolvedZoneId
  ).toBe(MONOLITH.id)
  const ossuary = Object.values(started.geometry.zones).find(
    (zone) => zone.templateKey === OSSUARY_TEMPLATE.key
  )
  expect(ossuary).toBeDefined()
  expect(started.generation.zones[ossuary!.id]?.depth).toBeGreaterThanOrEqual(2)

  // The board renders the carved rooms and the frontier ghosts are expandable.
  await expect(page.locator('[data-id="' + ENTRY.id + '"]')).toBeVisible()
  const generatedNode = page.locator(`[data-id="${generated[0]![0]}"]`)
  await expect(generatedNode).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Expand passage off/ }).first()
  ).toBeVisible()
  const objectivesTab = page.getByRole("tab", { name: /Objectives/ })
  await expect(objectivesTab).toContainText("2")
  await objectivesTab.click()
  await expect(
    page.getByText("Seeking · eligible past depth 0", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Seeking · eligible past depth 2", { exact: true })
  ).toBeVisible()

  await target.revealZones(expedition!.mapInstanceId, [
    MONOLITH.id,
    ossuary!.id,
  ])
  await page.reload()
  await expect(objectivesTab).toContainText("0")
  await objectivesTab.click()
  await expect(
    page.getByText(`Found · ${MONOLITH.name}`, { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText(`Found · ${ossuary!.name}`, { exact: true })
  ).toBeVisible()

  // Queue the unused site from a Zone, then force-place that same pending
  // declaration on an exact frontier stub. Placement resolves the private
  // scheduler declaration but the objective remains Seeking until its Zone is
  // revealed. The queued gesture itself is turn-free; the forced carve costs
  // the ordinary one expansion turn.
  await openQueueSiteMenu(page)
  await expect(
    page.getByRole("menuitem", {
      name: `${MONOLITH_TEMPLATE.name} Already on map`,
    })
  ).toBeDisabled()
  await expect(
    page.getByRole("menuitem", {
      name: `${OSSUARY_TEMPLATE.name} Already on map`,
    })
  ).toBeDisabled()
  await page.getByRole("menuitem", { name: CRYPT_TEMPLATE.name }).hover()
  await page
    .getByRole("menuitem", { name: "Next qualifying expansion" })
    .click()
  await expect
    .poll(async () => {
      const state = await target.getDungeonState(expedition!.id)
      const declaration = state.generation.declarations.find(
        (item) => item.templateKey === CRYPT_TEMPLATE.key
      )
      return {
        exists: declaration !== undefined,
        resolved: declaration?.resolvedZoneId ?? null,
      }
    })
    .toEqual({ exists: true, resolved: null })
  await expect(objectivesTab).toContainText("1")
  await expect(
    page.getByText(CRYPT_TEMPLATE.name, { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Seeking · eligible past depth 0", { exact: true })
  ).toBeVisible()
  await openQueueSiteMenu(page)
  await expect(
    page.getByRole("menuitem", {
      name: `${CRYPT_TEMPLATE.name} Already queued`,
    })
  ).toBeDisabled()
  await closeNestedMenu(page)

  const frontier = page
    .getByRole("button", { name: /Expand passage off/ })
    .first()
  await expect(frontier).toHaveAttribute("aria-disabled", "false")
  await frontier.dispatchEvent("contextmenu")
  await page.getByRole("menuitem", { name: "Force place site…" }).hover()
  await expect(
    page.getByRole("menuitem", { name: OSSUARY_TEMPLATE.name })
  ).toHaveAttribute("aria-disabled", "true")
  await page
    .getByRole("menuitem", { name: `${CRYPT_TEMPLATE.name} (queued)` })
    .click()

  await expect
    .poll(async () => {
      const state = await target.getDungeonState(expedition!.id)
      return {
        turn: state.turnCounter,
        resolved: state.generation.declarations.find(
          (item) => item.templateKey === CRYPT_TEMPLATE.key
        )?.resolvedZoneId,
      }
    })
    .toEqual({ turn: 1, resolved: expect.any(String) })
  await expect(objectivesTab).toContainText("1")
  await expect(
    page.getByText("Seeking · eligible past depth 0", { exact: true })
  ).toBeVisible()

  const afterForcePlace = await target.getDungeonState(expedition!.id)
  const cryptZoneId = afterForcePlace.generation.declarations.find(
    (item) => item.templateKey === CRYPT_TEMPLATE.key
  )?.resolvedZoneId
  expect(cryptZoneId).toBeDefined()
  await target.revealZones(expedition!.mapInstanceId, [cryptZoneId!])

  await page.reload()
  await expect(objectivesTab).toContainText("0")
  await objectivesTab.click()
  await expect(
    page.getByText(new RegExp(`^Found · ${CRYPT_TEMPLATE.name}$`))
  ).toBeVisible()

  await page.getByRole("button", { name: "Finish expedition" }).click()
  await page.getByRole("button", { name: "Finish expedition" }).last().click()
  await expect
    .poll(async () => (await target.getExpeditions())[0]?.status)
    .toBe("done")
  await expect
    .poll(() => target.getDiscoveredSiteKeys())
    .toEqual(
      expect.arrayContaining([
        MONOLITH_TEMPLATE.key,
        OSSUARY_TEMPLATE.key,
        CRYPT_TEMPLATE.key,
      ])
    )

  await mintExpeditionDraft(page, "Discovery-annotated Expedition")
  for (const site of [MONOLITH_TEMPLATE, OSSUARY_TEMPLATE, CRYPT_TEMPLATE]) {
    const row = page
      .getByRole("checkbox", { name: site.name })
      .locator("xpath=ancestor::li")
    await expect(row.getByText("Discovered previously")).toBeVisible()
  }
})
