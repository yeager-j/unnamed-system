import { expect, type Page } from "@playwright/test"

type SheetTabLabel = "Combat" | "Explore" | "Inventory" | "Archetypes"

/**
 * Navigates to a character sheet and selects a tab by clicking its trigger.
 * Sheet tabs are in-memory client state — the sheet always opens on Combat and
 * inactive panels are unmounted — so a spec that needs a non-Combat tab clicks
 * to it here rather than deep-linking via a `?tab=` query (which the sheet no
 * longer reads). Combat is the default, so it needs no helper: `page.goto(url)`.
 *
 * The click is retried until the trigger reports selected. On the heavier owner
 * sheet a click can land before hydration wires the handler and drop silently —
 * common in the CI production build, rare against `next dev` — so a single
 * click isn't reliable.
 */
export async function openSheetTab(
  page: Page,
  sheetUrl: string,
  tab: SheetTabLabel
): Promise<void> {
  await page.goto(sheetUrl)
  const trigger = page.getByRole("tab", { name: tab })
  await expect(async () => {
    await trigger.click()
    await expect(trigger).toHaveAttribute("aria-selected", "true")
  }).toPass({ timeout: 15_000 })
}
