import { expect, test } from "@playwright/test"

import { cleanup, createTestCharacter, createTracker } from "./fixtures/factory"

/**
 * UNN-558: the Journal tab's read surface + the sheet's viewer gating, from a
 * **signed-out** visitor (no storage state). One factory-minted character with
 * seeded narrative proves:
 *
 *  1. Journal renders Knives / Chains / History / Notes from the narrative
 *     component + the notes column.
 *  2. Explore renders Virtues / Talents / Identity read-only — no Add Spark,
 *     no Add Talent, no chip removes.
 *  3. Secrets never renders for a non-owner (rulebook: DM-private).
 */
const tracker = createTracker()
let target: Awaited<ReturnType<typeof createTestCharacter>>

test.beforeAll(async () => {
  target = await createTestCharacter(tracker, {
    name: "Journal Keeper",
    ancestryText: "Half-Elf",
    backgroundText: "Noble",
    backstoryText: "Raised in the shadow of the family ledger.",
    personalityTraits: "- Meticulous",
    hopes: "- Reclaim the estate",
    dreams: "To be named heir.",
    fears: "Being forgotten.",
    secrets: "Forged the succession papers.",
    notes: "Owes the quartermaster 30 gold.",
    knives: [
      {
        title: "The Ledger",
        description: "Proof of the debt, if it surfaces.",
      },
    ],
    chains: [
      { title: "My father chose them over me", description: "And I let him." },
    ],
  })
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test("Journal renders Knives, Chains, History, and Notes read-only", async ({
  page,
}) => {
  await page.goto(target.url)
  await page.getByRole("tab", { name: "Journal" }).click()

  const knives = page.getByRole("region", { name: "Knives" })
  await expect(knives).toContainText("The Ledger")
  await expect(knives).toContainText("Proof of the debt, if it surfaces.")

  const chains = page.getByRole("region", { name: "Chains" })
  await expect(chains).toContainText("My father chose them over me")

  const history = page.getByRole("region", { name: "History" })
  await expect(history).toContainText("Half-Elf")
  await expect(history).toContainText("Noble")
  await expect(history).toContainText(
    "Raised in the shadow of the family ledger."
  )

  await expect(page.getByRole("region", { name: "Notes" })).toContainText(
    "Owes the quartermaster 30 gold."
  )
})

test("Explore is read-only for a signed-out viewer and hides Secrets", async ({
  page,
}) => {
  await page.goto(target.url)
  await page.getByRole("tab", { name: "Explore" }).click()

  const virtues = page.getByRole("region", { name: "Virtues" })
  await expect(virtues).toContainText("Sparks · 0 / 7")
  await expect(page.getByRole("region", { name: "Identity" })).toContainText(
    "Meticulous"
  )

  // Snapshot, not poll: owner affordances must not exist at all.
  expect(await page.getByRole("button", { name: "Add Spark" }).count()).toBe(0)
  expect(await page.getByRole("button", { name: "Add Talent" }).count()).toBe(0)
  expect(await page.getByRole("button", { name: /^Remove / }).count()).toBe(0)

  // Secrets is owner-only (rulebook 1.5: shared with the DM in private): the
  // block renders as deliberately-covered Skeleton bars, and the value is
  // redacted server-side — absent from the whole document (DOM + inlined RSC
  // payload), not merely unrendered.
  const identity = page.getByRole("region", { name: "Identity" })
  await expect(identity.getByText("Secrets")).toBeVisible()
  await expect(
    identity.getByRole("img", { name: /Secrets are hidden/ })
  ).toBeVisible()
  expect(await page.content()).not.toContain("Forged the succession papers.")
})
