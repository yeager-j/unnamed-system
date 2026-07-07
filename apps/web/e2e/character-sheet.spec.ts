import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  cleanup,
  createTestCharacter,
  createTracker,
  type TestCharacter,
} from "./fixtures/factory"

/**
 * E2E for the v2 character sheet (S2a — UNN-557): the cast/heal/rest loop
 * rebuilt over the entity door. One factory-minted Knight (dual-minted entity
 * row) exercises the rail's writes — pools, rest (incl. the over-spend
 * refusal), victories → level-up, prisma, the Valor mechanic, the archetype
 * switch — and the Combat tab's skill cards + Use Skill.
 *
 * **Serial**: every test mutates the one target; `beforeEach` reloads the
 * sheet so each starts from the persisted state its predecessor left. The
 * optimistic-instant assertions (no waitForResponse before the expect) are
 * deliberate — the CH18 client re-fold is the thing under test.
 */
test.describe.configure({ mode: "serial" })
test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
let target: TestCharacter

test.beforeAll(async () => {
  target = await createTestCharacter(tracker, {
    name: "Sheet Knight",
    activeArchetypeKey: "knight",
    archetypes: [
      {
        archetypeKey: "knight",
        rank: 2,
        mechanicState: { kind: "valor", value: 2 },
      },
      {
        archetypeKey: "mage",
        rank: 1,
        mechanicState: { kind: "stains", tokens: [null, null, null, null] },
      },
    ],
    victories: 6,
  })
})

test.afterAll(async () => {
  await cleanup(tracker)
})

/** The rail's `current / max` readout for one pool row. */
function poolValue(page: Page, label: "HP" | "SP") {
  return page
    .locator("section[aria-label='Vitals'] div", {
      has: page.getByText(label, { exact: true }),
    })
    .locator("span.tabular-nums")
    .first()
}

async function readPool(
  page: Page,
  label: "HP" | "SP"
): Promise<{ current: number; max: number }> {
  const text = await poolValue(page, label).innerText()
  const [current, max] = text.split("/").map((part) => Number(part.trim()))
  return { current: current!, max: max! }
}

test(
  "renders the sheet and round-trips an HP adjustment",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto(target.url)
    await expect(page.getByRole("heading", { name: target.name })).toBeVisible()
    await expect(page.getByRole("region", { name: "Affinities" })).toBeVisible()

    const before = await readPool(page, "HP")
    expect(before.current).toBe(before.max)

    await page.getByRole("button", { name: "Adjust HP" }).click()
    await page.getByLabel("Adjust HP amount").fill("5")
    await page.getByRole("button", { name: "Damage" }).click()

    // The optimistic re-fold moves the readout before the round-trip lands.
    await expect(poolValue(page, "HP")).toHaveText(
      `${before.current - 5} / ${before.max}`
    )

    // And the server agrees: the value survives a full reload. Polled — an
    // immediate reload would abort the still-in-flight commit.
    await expect(async () => {
      await page.reload()
      await expect(poolValue(page, "HP")).toHaveText(
        `${before.current - 5} / ${before.max}`
      )
    }).toPass()
  }
)

test("a respite over-spend refuses inline; a valid respite heals", async ({
  page,
}) => {
  await page.goto(target.url)
  const before = await readPool(page, "HP")
  expect(before.current).toBeLessThan(before.max)

  await page.getByRole("button", { name: "Rest" }).click()
  // The variant toggle and the confirm button share the variant's label —
  // the confirm sits last in the dialog's DOM (footer).
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Respite" }).first().click()

  // A low-level Knight has few Hit Dice — 99 must refuse with the
  // failure-matrix message.
  await page.getByLabel("Hit Dice to spend").fill("99")
  await page.getByLabel("HP rolled").fill("4")
  await dialog.getByRole("button", { name: "Respite" }).last().click()
  await expect(page.getByRole("alert")).toContainText(
    "Not enough unspent Hit Dice"
  )

  await page.getByLabel("Hit Dice to spend").fill("1")
  await dialog.getByRole("button", { name: "Respite" }).last().click()
  await expect(poolValue(page, "HP")).toHaveText(
    `${Math.min(before.current + 4, before.max)} / ${before.max}`
  )
})

test("a full rest restores the pools to max", async ({ page }) => {
  await page.goto(target.url)
  const hp = await readPool(page, "HP")

  await page.getByRole("button", { name: "Rest" }).click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Full Rest" })
    .last()
    .click()

  await expect(poolValue(page, "HP")).toHaveText(`${hp.max} / ${hp.max}`)
})

test("awarding the 7th victory unlocks an explicit level up", async ({
  page,
}) => {
  await page.goto(target.url)
  await expect(page.getByText("Lv 1", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Victories" }).click()
  await page.getByRole("button", { name: "+ Award Victory" }).click()

  const levelUp = page.getByRole("button", { name: "Level Up" })
  await expect(levelUp).toBeVisible()
  await levelUp.click()

  await expect(page.getByText("Lv 2", { exact: true })).toBeVisible()
  await expect(async () => {
    await page.reload()
    await expect(page.getByText("Lv 2", { exact: true })).toBeVisible()
  }).toPass()
})

test("the Valor widget steps and lights its threshold ladder", async ({
  page,
}) => {
  await page.goto(target.url)
  const widget = page.getByRole("region", { name: "Archetype Mechanic" })
  await expect(widget.getByText("2/7")).toBeVisible()

  await widget.getByRole("button", { name: "Increase Valor" }).click()
  await expect(widget.getByText("3/7")).toBeVisible()
  // The 3+ threshold row is now active (resists fold into the affinity strip).
  await expect(
    page.getByRole("region", { name: "Affinities" }).getByText("Resist").first()
  ).toBeVisible()
})

test("switching the active archetype swaps the mechanic widget and skills", async ({
  page,
}) => {
  await page.goto(target.url)
  await page.getByRole("button", { name: "Switch Archetype" }).click()
  await page.getByRole("button", { name: /Mage · Rk 1/ }).click()

  // The optimistic re-fold swaps the widget + kit in the same frame.
  await expect(
    page.getByRole("region", { name: "Archetype Mechanic" }).getByText("Stains")
  ).toBeVisible()

  // Switch back for any later run against the same row.
  await page.getByRole("button", { name: "Switch Archetype" }).click()
  await page.getByRole("button", { name: /Knight · Rk 2/ }).click()
  await expect(
    page.getByRole("region", { name: "Archetype Mechanic" }).getByText("Valor")
  ).toBeVisible()
})

test("Use Skill spends the resolved SP cost", async ({ page }) => {
  await page.goto(target.url)
  const before = await readPool(page, "SP")

  const skills = page.getByRole("region", { name: "Skills" })
  // An SP-cost card with a Use button (an HP-cost card would spend vitals).
  const card = skills.locator("article", {
    has: page.locator("[aria-label*=' SP']"),
  })
  await expect(card.first()).toBeVisible()

  // Read the card's cost coin (`{n}` over `SP`) to assert the exact spend.
  const costLabel = await card
    .first()
    .locator("[aria-label^='Costs']")
    .getAttribute("aria-label")
  const cost = Number(/Costs (\d+) SP/.exec(costLabel ?? "")?.[1])
  expect(cost).toBeGreaterThan(0)

  await card.first().getByRole("button", { name: "Use Skill" }).click()
  await expect(poolValue(page, "SP")).toHaveText(
    `${before.current - cost} / ${before.max}`
  )
})

test("a signed-out visitor gets a read-only sheet", async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  await page.goto(target.url)

  await expect(page.getByRole("heading", { name: target.name })).toBeVisible()
  await expect(page.getByRole("button", { name: "Adjust HP" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Use Skill" })).toHaveCount(0)
  await context.close()
})
