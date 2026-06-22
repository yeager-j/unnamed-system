"use client"

import { type Icon } from "@phosphor-icons/react"
import {
  BackpackIcon,
  CardsIcon,
  CompassIcon,
  SwordIcon,
} from "@phosphor-icons/react/dist/ssr"
import { type ReactNode } from "react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { useSheetNav } from "./sheet-nav-context"
import { type SheetTabKey } from "./sheet-tab-keys"

const TABS: ReadonlyArray<{ key: SheetTabKey; label: string; Icon: Icon }> = [
  { key: "combat", label: "Combat", Icon: SwordIcon },
  { key: "explore", label: "Explore", Icon: CompassIcon },
  { key: "inventory", label: "Inventory", Icon: BackpackIcon },
  { key: "archetypes", label: "Archetypes", Icon: CardsIcon },
]

export interface SheetTabsProps {
  combat: ReactNode
  explore: ReactNode
  inventory: ReactNode
  archetypes: ReactNode
}

/**
 * Client tab shell for the character sheet. The four panels are rendered on the
 * server (RSC) and handed in as props; this component owns only the active-tab
 * state. It's *controlled* — switching is instant client state with no server
 * round-trip and no URL change. The active-tab state lives in
 * {@link SheetNavProvider} (so the command palette can drive it too) and always
 * opens on Combat. Inactive panels are unmounted (the Base UI default with
 * `keepMounted` off), so a switch fully tears down the previous tab's tree.
 * Triggers collapse to icon-only below `sm`.
 */
export function SheetTabs({
  combat,
  explore,
  inventory,
  archetypes,
}: SheetTabsProps) {
  const { activeTab, setActiveTab } = useSheetNav()
  const panels: Record<SheetTabKey, ReactNode> = {
    combat,
    explore,
    inventory,
    archetypes,
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(next) => setActiveTab(next as SheetTabKey)}
      className="gap-6"
    >
      <TabsList className="w-full">
        {TABS.map(({ key, label, Icon }) => (
          <TabsTrigger key={key} value={key} aria-label={label}>
            <Icon weight="bold" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map(({ key }) => (
        <TabsContent key={key} value={key} className="flex flex-col gap-4">
          {panels[key]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
