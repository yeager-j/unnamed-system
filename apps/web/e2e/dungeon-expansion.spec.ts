import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  createDungeonExpansionTarget,
  ENTRY,
  HALL_TEMPLATE,
  OSSUARY_TEMPLATE,
} from "./fixtures/dungeon-expansion-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * The UNN-642 expand loop, end to end through the real console: start an
 * expedition (stubs sprout off the bound Entry), click a stub ghost (the one
 * non-optimistic spatial write — the fixture set's `closureChance: 0` + single
 * weighted template make the mint deterministic), retract the minted room from
 * its context menu (byte-identical stub restoration), then force-pick the
 * weight-0 Ossuary from the ghost's menu. Every persisted claim polls the DB
 * (the write-then-read doctrine); the UI drives every gesture.
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

/** Mint an expedition from the Region detail and start it from prep with the
 *  PC placed in Entry; resolves once the run console is live. */
async function mintAndStartExpedition(page: Page, name: string) {
  await page.goto(target.region.url)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "New expedition" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Name").fill(name)
  await dialog.getByRole("button", { name: "Start expedition" }).click()

  await page.waitForURL(/\/dungeon\//)
  await page.waitForLoadState("networkidle")
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: ENTRY.name }).click()
  await page.getByRole("button", { name: "Start expedition" }).click()

  await expect(page.getByRole("button", { name: "Advance turn" })).toBeVisible()
}

test("expand mints a room, retract restores the stub, force-pick lands the named template", async ({
  page,
}) => {
  await mintAndStartExpedition(page, "Expansion Expedition")

  const [expedition] = await target.getExpeditions()
  expect(expedition).toBeDefined()
  expect(expedition!.status).toBe("active")

  // Start sprouted Entry's frontier: two open stubs (two non-optional template
  // exits, no authored connections to debit), rendered as expandable ghosts.
  const started = await target.getInstanceState(expedition!.mapInstanceId)
  const startStubIds = Object.keys(started.generation.stubs)
  expect(startStubIds).toHaveLength(2)
  expect(started.generation.startingZoneIds).toEqual([ENTRY.id])
  const ghosts = page.getByRole("button", {
    name: `Expand passage off ${ENTRY.name}`,
  })
  await expect(ghosts).toHaveCount(2)

  // ── Expand: one click, server-resolved mint ───────────────────────────────
  await ghosts.first().click()

  await expect
    .poll(async () => {
      const state = await target.getInstanceState(expedition!.mapInstanceId)
      return Object.values(state.generation.zones).filter(
        (provenance) => provenance.source === "generated"
      ).length
    })
    .toBe(1)

  const minted = await target.getInstanceState(expedition!.mapInstanceId)
  const mintedZone = Object.values(minted.geometry.zones).find(
    (zone) => minted.generation.zones[zone.id]?.source === "generated"
  )
  expect(mintedZone).toBeDefined()
  expect(mintedZone!.templateKey).toBe(HALL_TEMPLATE.key)
  // One of the two start stubs was consumed; the mint sprouted one child
  // (two surviving exits − the incoming connection).
  const consumedStubId = startStubIds.find(
    (stubId) => minted.generation.stubs[stubId] === undefined
  )
  expect(consumedStubId).toBeDefined()
  // Exit-id continuity: the minted connection took the consumed stub's id.
  expect(minted.geometry.connections[consumedStubId!]).toMatchObject({
    fromZoneId: ENTRY.id,
    toZoneId: mintedZone!.id,
  })

  const dungeonAfterMint = await target.getDungeonState(expedition!.id)
  // The carve cost one turn; the ledger recorded the mint + advanced cursors.
  expect(dungeonAfterMint.turnCounter).toBe(1)
  expect(dungeonAfterMint.generation.mints[mintedZone!.id]).toMatchObject({
    templateKey: HALL_TEMPLATE.key,
  })
  expect(
    dungeonAfterMint.generation.streamCursors["closure"]
  ).toBeGreaterThanOrEqual(1)

  // The minted room renders on the board (the React Flow node is keyed by the
  // zone id; the name also appears in threshold-notch labels, so target the
  // node, not the text).
  const mintedNode = page.locator(`[data-id="${mintedZone!.id}"]`)
  await expect(mintedNode).toBeVisible()

  // ── Retract: context-menu-only, stub restored byte-identical ──────────────
  await mintedNode.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Retract room" }).click()

  await expect
    .poll(async () => {
      const state = await target.getInstanceState(expedition!.mapInstanceId)
      return state.geometry.zones[mintedZone!.id] === undefined
    })
    .toBe(true)

  const retracted = await target.getInstanceState(expedition!.mapInstanceId)
  // The consumed stub is back under its original id with its stored payload.
  expect(retracted.generation.stubs[consumedStubId!]).toEqual(
    started.generation.stubs[consumedStubId!]
  )
  const dungeonAfterRetract = await target.getDungeonState(expedition!.id)
  expect(dungeonAfterRetract.generation.mints).toEqual({})
  // Cursors never rewind — the re-expandable stub will roll fresh positions.
  expect(dungeonAfterRetract.generation.streamCursors).toEqual(
    dungeonAfterMint.generation.streamCursors
  )

  // ── Force-pick: the weight-0 template through the identical path ──────────
  await expect(ghosts).toHaveCount(2)
  await ghosts.first().click({ button: "right" })
  await page.getByRole("menuitem", { name: "Force pick…" }).hover()
  await page.getByRole("menuitem", { name: OSSUARY_TEMPLATE.name }).click()

  await expect
    .poll(async () => {
      const state = await target.getInstanceState(expedition!.mapInstanceId)
      return Object.values(state.generation.zones).find(
        (provenance) => provenance.source === "generated"
      )?.templateKey
    })
    .toBe(OSSUARY_TEMPLATE.key)
  const forced = await target.getInstanceState(expedition!.mapInstanceId)
  const ossuary = Object.values(forced.geometry.zones).find(
    (zone) => zone.templateKey === OSSUARY_TEMPLATE.key
  )
  expect(ossuary).toBeDefined()
  await expect(page.locator(`[data-id="${ossuary!.id}"]`)).toBeVisible()
})
