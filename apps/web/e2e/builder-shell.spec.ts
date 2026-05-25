import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { characters, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"

/**
 * Builder shell — the contract this PR delivers (UNN-214):
 *
 * - A fresh draft lands on `/corpus`.
 * - The chapter header renders the Roman + serif title for each movement.
 * - The Continue link advances the row's `builderStep` cursor AND navigates.
 * - `/builder/{shortId}` (no movement segment) redirects to the cursor,
 *   not always Movement 1.
 * - Visited dots navigate back; upcoming dots are inert.
 * - Movement 4 (Persona) has no Continue link and a named back-link.
 *
 * Movement bodies are placeholders here — per-movement tickets
 * (UNN-215 → UNN-218) own end-to-end content coverage for each movement.
 */

const DEV_USER_ID = "dev-user-claude"

test.describe.configure({ mode: "serial" })

async function clearDevUserDrafts(): Promise<void> {
  await getDb()
    .delete(characters)
    .where(
      and(eq(characters.ownerId, DEV_USER_ID), eq(characters.status, "draft"))
    )
}

function shortIdFromBuilderUrl(url: string): string {
  const match = url.match(/\/builder\/([a-z0-9]+)\//)
  if (!match) throw new Error(`expected a /builder/{shortId}/ URL, got ${url}`)
  return match[1]!
}

async function readBuilderStep(shortId: string): Promise<number> {
  const [row] = await getDb()
    .select({ builderStep: characters.builderStep })
    .from(characters)
    .where(eq(characters.shortId, shortId))
    .limit(1)
  if (!row) throw new Error(`no row for shortId=${shortId}`)
  return row.builderStep
}

test.describe("builder shell", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("renders chapter chrome, advances the cursor on Continue, and bounces /builder to the cursor", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()

    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await expect(
      page.getByRole("heading", { level: 1, name: "Corpus" })
    ).toBeVisible()
    await expect(
      page.getByText("The body your character will inhabit.")
    ).toBeVisible()

    await page.getByRole("button", { name: "Continue to Origo" }).click()
    await expect(page).toHaveURL(`/builder/${shortId}/origo`)
    await expect(
      page.getByRole("heading", { level: 1, name: "Origo" })
    ).toBeVisible()
    expect(await readBuilderStep(shortId)).toBe(1)

    await page.goto(`/builder/${shortId}`)
    await expect(page).toHaveURL(`/builder/${shortId}/origo`)

    await page.getByRole("link", { name: "Movement 1 — Corpus" }).click()
    await expect(page).toHaveURL(`/builder/${shortId}/corpus`)
  })

  test("Movement 4 (Persona) has a named back-link and no Continue", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()

    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await page.getByRole("button", { name: "Continue to Origo" }).click()
    await page.getByRole("button", { name: "Continue to Animus" }).click()
    await page.getByRole("button", { name: "Continue to Persona" }).click()

    await expect(page).toHaveURL(`/builder/${shortId}/persona`)
    await expect(
      page.getByRole("heading", { level: 1, name: "Persona" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /^Continue to/ })
    ).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: "Back to Animus" })
    ).toBeVisible()
  })
})
