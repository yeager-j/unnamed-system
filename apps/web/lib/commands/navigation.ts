import type { SheetTabKey } from "@/components/character-sheet/sheet-tab-keys"

import type { Command } from "./types"

/**
 * Navigation commands (group "Navigate"). These are read-only and stay visible
 * for every viewer, including signed-out public ones — so none set
 * `requiresOwner`. The four in-sheet tabs drive {@link CommandContext.setActiveTab}
 * (the tabs are client state, not routing); the Atlas and My Characters entries
 * are real routes via the router.
 */

const TAB_COMMANDS: ReadonlyArray<{
  tab: SheetTabKey
  label: string
  keywords: string[]
}> = [
  {
    tab: "combat",
    label: "Jump to Combat",
    keywords: ["skills", "affinities"],
  },
  {
    tab: "explore",
    label: "Jump to Explore",
    keywords: ["virtues", "talents", "identity", "notes"],
  },
  {
    tab: "inventory",
    label: "Jump to Inventory",
    keywords: ["items", "gear", "equipment", "currency"],
  },
  {
    tab: "archetypes",
    label: "Jump to Archetypes",
    keywords: ["lineage", "ranks"],
  },
]

const tabCommands: Command[] = TAB_COMMANDS.map(({ tab, label, keywords }) => ({
  id: `nav.${tab}`,
  label,
  group: "Navigate",
  keywords: [tab, ...keywords],
  run: (ctx) => ctx.setActiveTab(tab),
}))

export const navigationCommands: Command[] = [
  ...tabCommands,
  {
    id: "nav.atlas",
    label: "Open Lineage Atlas",
    description: "Browse and grow your Archetype lineage",
    group: "Navigate",
    keywords: ["lineage", "atlas", "archetype", "unlock", "rank"],
    run: (ctx) =>
      ctx.router.push(`/c/${ctx.character.shortId}/archetypes/atlas`),
  },
  {
    id: "nav.my-characters",
    label: "Open My Characters",
    description: "Back to your character list",
    group: "Navigate",
    keywords: ["home", "list", "roster"],
    run: (ctx) => ctx.router.push("/"),
  },
]
