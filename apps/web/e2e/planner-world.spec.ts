import { expect, test } from "@playwright/test"
import { and, eq, isNull } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaignClock } from "@/lib/db/schema/campaign-clock"
import { campaignFolder } from "@/lib/db/schema/campaign-folder"
import {
  campaignBeat,
  campaignBeatMention,
} from "@/lib/db/schema/campaign-notes"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"
import { campaignNpc, campaignRelation } from "@/lib/db/schema/campaign-world"
import { entity } from "@/lib/db/schema/entity"

import { STORAGE_STATE } from "./auth.setup"
import {
  cleanup,
  createTestCampaign,
  createTestNpc,
  createTracker,
  type TestNpc,
} from "./fixtures/factory"

/**
 * E2E for Campaign Planner phase 6 (UNN-579): the D11 folder trees (nesting,
 * move, cycle guard, cascade-delete-floats-contents), NPC authoring (Lineage
 * uniqueness in the picker, per-field narrative autosave), relations with the
 * reverse convenience + tombstone purge, honest ref counts, and the
 * entity-page world-update composer. Serial over one campaign — the later
 * tests consume rows the earlier ones create.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const DEV_ID = "dev-user-claude"

const tracker = createTracker()
let campaign: Awaited<ReturnType<typeof createTestCampaign>>
let holder: TestNpc
let subject: TestNpc

test.beforeAll(async () => {
  campaign = await createTestCampaign(tracker, { dmUserId: DEV_ID })
  holder = await createTestNpc(campaign.id, { name: "Holder" })
  subject = await createTestNpc(campaign.id, { name: "Subject" })
  await getDb()
    .update(campaignNpc)
    .set({ lineageKey: "warlock" })
    .where(eq(campaignNpc.entityId, holder.entityId))
  // The world-update composer needs a started clock (day-stamped capture).
  await getDb()
    .insert(campaignClock)
    .values({
      campaignId: campaign.id,
      currentDay: 3,
      slotTemplate: [{ label: "Morning" }],
    })
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function readFolders() {
  return getDb()
    .select({
      id: campaignFolder.id,
      name: campaignFolder.name,
      parentId: campaignFolder.parentId,
    })
    .from(campaignFolder)
    .where(eq(campaignFolder.campaignId, campaign.id))
}

async function readSubject() {
  const [row] = await getDb()
    .select({
      folderId: campaignNpc.folderId,
      lineageKey: campaignNpc.lineageKey,
      narrative: entity.narrative,
    })
    .from(campaignNpc)
    .innerJoin(entity, eq(entity.id, campaignNpc.entityId))
    .where(eq(campaignNpc.entityId, subject.entityId))
  return row!
}

async function readRelations() {
  return getDb()
    .select({
      id: campaignRelation.id,
      sourceId: campaignRelation.sourceId,
      targetId: campaignRelation.targetId,
      label: campaignRelation.label,
    })
    .from(campaignRelation)
    .where(eq(campaignRelation.campaignId, campaign.id))
}

test("folders nest, items move in, and deleting the parent cascades folders while contents float", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/npcs`)

  // Root folder via the rail header.
  await page.getByRole("button", { name: "New folder" }).click()
  await page.getByLabel("Name").fill("Court")
  await page.getByRole("button", { name: "Create" }).click()
  await expect
    .poll(async () => (await readFolders()).map((f) => f.name))
    .toContain("Court")

  // Nested folder via the folder's ⋯ menu.
  await page.getByRole("button", { name: "Court actions" }).click()
  await page.getByRole("menuitem", { name: "New folder inside" }).click()
  await page.getByLabel("Name").fill("Inner Circle")
  await page.getByRole("button", { name: "Create" }).click()
  await expect
    .poll(async () => {
      const folders = await readFolders()
      const court = folders.find((f) => f.name === "Court")
      const inner = folders.find((f) => f.name === "Inner Circle")
      return court !== undefined && inner?.parentId === court.id
    })
    .toBe(true)

  // Move the subject NPC into the nested folder via its ⋯ Move-to submenu.
  await page.getByRole("button", { name: `${subject.name} actions` }).click()
  await page.getByRole("menuitem", { name: "Move to…" }).hover()
  await page.getByRole("menuitem", { name: "Inner Circle" }).click()
  await expect
    .poll(async () => {
      const folders = await readFolders()
      const inner = folders.find((f) => f.name === "Inner Circle")
      return (await readSubject()).folderId === inner?.id
    })
    .toBe(true)

  // The cycle guard: Court's own subtree is disabled in its Move-to menu.
  await page.getByRole("button", { name: "Court actions" }).click()
  await page.getByRole("menuitem", { name: "Move to…" }).hover()
  await expect(
    page.getByRole("menuitem", { name: "Inner Circle" })
  ).toBeDisabled()
  await page.keyboard.press("Escape")

  // Deleting Court cascades Inner Circle and floats the NPC to Unfiled.
  // (Reload first: the earlier writes' revalidations can re-render the tree
  // under an open menu, detaching the row mid-click.)
  await page.reload()
  await page.getByRole("button", { name: "Court actions" }).click()
  await page.getByRole("menuitem", { name: "Delete folder…" }).click()
  await page.getByRole("button", { name: "Delete folder" }).click()
  await expect.poll(async () => (await readFolders()).length).toBe(0)
  await expect.poll(async () => (await readSubject()).folderId).toBe(null)
})

test("the Lineage picker disables taken rows and persists a free pick", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/npcs/${subject.entityId}`)
  await page.getByRole("button", { name: "Set Lineage" }).click()

  // Holder already claims Warlock — the row is disabled with the holder shown.
  const warlockRow = page.getByRole("option", { name: /Warlock/ })
  await expect(warlockRow).toHaveAttribute("aria-disabled", "true")
  await expect(warlockRow).toContainText(`held by ${holder.name}`)

  await page.getByRole("option", { name: "Bard" }).click()
  await expect.poll(async () => (await readSubject()).lineageKey).toBe("bard")
})

test("a narrative document autosaves one field into the entity's jsonb", async ({
  page,
}) => {
  await page.goto(
    `/campaigns/${campaign.shortId}/npcs/${subject.entityId}?doc=fears`
  )
  const editor = page.locator(".cm-content")
  await editor.click()
  await page.keyboard.type("Deep water. Her brother fell through the ice.")

  await expect
    .poll(async () => {
      const narrative = (await readSubject()).narrative as {
        fears?: string | null
      } | null
      return narrative?.fears ?? null
    })
    .toContain("Deep water")
})

test("relations add with the reverse convenience and purge when the NPC tombstones", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/npcs/${subject.entityId}`)
  await page.getByRole("button", { name: "Add relation" }).click()
  await page.getByPlaceholder("Link to…").fill(holder.name)
  await page.getByRole("option", { name: new RegExp(holder.name) }).click()
  await page.getByLabel("Label").fill("owes a debt to")
  await page.getByText("Also add the reverse").click()
  await page.getByRole("button", { name: "Add relation" }).last().click()

  // Two directed rows; the page shows only its own outgoing edge.
  await expect.poll(async () => (await readRelations()).length).toBe(2)
  const rows = await readRelations()
  expect(rows.filter((r) => r.sourceId === subject.entityId)).toHaveLength(1)
  expect(rows.filter((r) => r.sourceId === holder.entityId)).toHaveLength(1)

  // The delete confirm counts the references it is about to sever.
  await page.getByRole("button", { name: "Delete NPC" }).first().click()
  await expect(page.getByText(/Referenced by 2 relations/)).toBeVisible()
  await page
    .getByRole("button", { name: "Delete NPC", exact: true })
    .last()
    .click()

  // Tombstoning hard-deletes the touching edges in both directions (D4).
  await expect.poll(async () => (await readRelations()).length).toBe(0)
  await expect
    .poll(async () => {
      const [row] = await getDb()
        .select({ deletedAt: entity.deletedAt })
        .from(entity)
        .where(eq(entity.id, subject.entityId))
      return row?.deletedAt !== null
    })
    .toBe(true)
})

test("the entity-page composer records a world update stamped on the current day", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/npcs/${holder.entityId}`)
  await page
    .getByRole("textbox", { name: `Update about ${holder.name}` })
    .fill("Seen bargaining at the night market.")
  await page.getByRole("button", { name: "Record activity" }).click()

  await expect
    .poll(async () => {
      const [row] = await getDb()
        .select({ day: campaignUpdate.day, slotId: campaignUpdate.slotId })
        .from(campaignUpdate)
        .where(
          and(
            eq(campaignUpdate.campaignId, campaign.id),
            eq(campaignUpdate.primaryId, holder.entityId),
            isNull(campaignUpdate.slotId)
          )
        )
      return row?.day ?? null
    })
    .toBe(3)

  // The entry lands in the timeline as the shared card.
  await expect(
    page.getByText("Seen bargaining at the night market.")
  ).toBeVisible()
})

test("the mention index feeds 'Referenced in N beats'", async ({ page }) => {
  const db = getDb()
  const [beat] = await db
    .insert(campaignBeat)
    .values({
      campaignId: campaign.id,
      title: "The bargain",
      body: `A scene about [[npc:${holder.entityId}|${holder.name}]].`,
    })
    .returning({ id: campaignBeat.id })
  await db.insert(campaignBeatMention).values({
    beatId: beat!.id,
    participantKind: "npc",
    participantId: holder.entityId,
  })

  await page.goto(`/campaigns/${campaign.shortId}/npcs/${holder.entityId}`)
  await expect(page.getByText("Referenced in 1 beat.")).toBeVisible()
})
