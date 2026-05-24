import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"

test.describe("signed-out", () => {
  test("renders the sign-in landing, not the project scaffolding", async ({
    page,
  }) => {
    const response = await page.goto("/")
    expect(response?.ok()).toBeTruthy()

    await expect(
      page.getByText("Sign in to manage your characters")
    ).toBeVisible()
    await expect(
      page
        .getByRole("main")
        .getByRole("button", { name: "Sign in with Google" })
    ).toBeVisible()
  })
})

test.describe("signed-in", () => {
  test.use({ storageState: STORAGE_STATE })

  test("renders the roster, the Create CTA, and the account-menu entry", async ({
    page,
  }) => {
    const response = await page.goto("/")
    expect(response?.ok()).toBeTruthy()

    await expect(
      page.getByRole("heading", { name: "My Characters" })
    ).toBeVisible()

    const irisCard = page
      .locator('[data-slot="item"]')
      .filter({ hasText: "Iris Vey" })
    await expect(irisCard).toBeVisible()
    await expect(irisCard.getByText(/Level 1 ·/)).toBeVisible()
    await expect(irisCard.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/c/claude-1"
    )

    // UNN-204 enabled the Create CTA. It now spins up a draft via
    // `startCharacterDraftAction` and routes the user into the builder;
    // here we just verify the button is mounted and enabled. The full
    // create + auto-save + advance flow lives in `builder.spec.ts`
    // (forthcoming) to keep this read-only home check fast.
    const createCta = page.getByRole("button", {
      name: "Create new character",
    })
    await expect(createCta).toBeVisible()
    await expect(createCta).toBeEnabled()

    await page.getByRole("button", { name: "Open account menu" }).click()
    await expect(
      page.getByRole("menuitem", { name: "My Characters" })
    ).toBeVisible()
  })

  test("split-button dropdown disables the pre-MVP actions and enables Delete", async ({
    page,
  }) => {
    await page.goto("/")

    const irisCard = page
      .locator('[data-slot="item"]')
      .filter({ hasText: "Iris Vey" })
    await irisCard.getByRole("button", { name: "Actions for Iris Vey" }).click()

    for (const label of ["Edit", "Duplicate", "Share"]) {
      const item = page.getByRole("menuitem", { name: label })
      await expect(item).toBeVisible()
      await expect(item).toHaveAttribute("data-disabled", "")
    }
    const deleteItem = page.getByRole("menuitem", { name: "Delete" })
    await expect(deleteItem).toBeVisible()
    await expect(deleteItem).not.toHaveAttribute("data-disabled", "")

    await deleteItem.click()
    await expect(
      page.getByRole("alertdialog", { name: /Delete Iris Vey/ })
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })
})
