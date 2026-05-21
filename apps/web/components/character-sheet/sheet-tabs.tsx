"use client"

import { type Icon } from "@phosphor-icons/react"
import {
  BackpackIcon,
  CardsIcon,
  CompassIcon,
  SwordIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState, type ReactNode } from "react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { type SheetTabKey } from "./sheet-tab-keys"

const TABS: ReadonlyArray<{ key: SheetTabKey; label: string; Icon: Icon }> = [
  { key: "combat", label: "Combat", Icon: SwordIcon },
  { key: "explore", label: "Explore", Icon: CompassIcon },
  { key: "inventory", label: "Inventory", Icon: BackpackIcon },
  { key: "archetypes", label: "Archetypes", Icon: CardsIcon },
]

export interface SheetTabsProps {
  defaultTab: SheetTabKey
  combat: ReactNode
  explore: ReactNode
  inventory: ReactNode
  archetypes: ReactNode
}

/**
 * Client tab shell for the character sheet. The four panels are rendered on the
 * server (RSC) and handed in as props; this component owns only the active-tab
 * state. It's *controlled* — switching is instant client state with no server
 * round-trip — and the URL is mirrored cosmetically via `history.replaceState`
 * (not the Next router, which would re-render the route and reset the tabs) so
 * a view stays shareable by `?tab=`. The initial tab comes from the server via
 * {@link SheetTabsProps.defaultTab}, so a deep link opens the right tab.
 * Inactive panels are unmounted (the Base UI default with `keepMounted` off),
 * so a switch fully tears down the previous tab's tree. Triggers collapse to
 * icon-only below `sm`.
 */
export function SheetTabs({
  defaultTab,
  combat,
  explore,
  inventory,
  archetypes,
}: SheetTabsProps) {
  const [value, setValue] = useState<SheetTabKey>(defaultTab)
  const panels: Record<SheetTabKey, ReactNode> = {
    combat,
    explore,
    inventory,
    archetypes,
  }

  function handleValueChange(next: string) {
    setValue(next as SheetTabKey)
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?tab=${next}`
    )
  }

  return (
    <Tabs value={value} onValueChange={handleValueChange} className="gap-6">
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
