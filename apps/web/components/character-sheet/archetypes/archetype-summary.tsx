"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"

import { useDrawerDirection } from "@/hooks/use-drawer-direction"
import type { ArchetypeEntry } from "@/lib/game/archetypes/entries"
import { LINEAGE_LABELS, TIER_LABELS } from "@/lib/ui/labels"

import { ArchetypeDetail } from "./archetype-detail"
import { ArchetypeSummaryRow } from "./archetype-summary-row"

/**
 * One Archetype's compact entry in the Lineage-grouped list, wrapped with the
 * Drawer that opens the full {@link ArchetypeDetail}. Composes
 * {@link ArchetypeSummaryRow} (the compact card body) with a "Show details"
 * trigger and the responsive drawer side from {@link useDrawerDirection}.
 *
 * Used for *every* unlocked Archetype; the active one carries an `Active`
 * badge so the Lineage grid stays coherent while the featured Active card
 * above provides the spotlight view.
 */
export function ArchetypeSummary({ entry }: { entry: ArchetypeEntry }) {
  const { archetype, row, isActive } = entry
  const drawerDirection = useDrawerDirection()

  return (
    <Drawer direction={drawerDirection}>
      <ArchetypeSummaryRow
        entry={entry}
        trigger={
          <DrawerTrigger asChild>
            <Button variant="ghost" size="sm">
              Show details
            </Button>
          </DrawerTrigger>
        }
      />
      <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-xl">
        <DrawerHeader>
          <DrawerTitle className="flex items-baseline gap-2">
            <span>{archetype.name}</span>
            <span className="text-sm font-normal text-muted-foreground">
              Rank {row.rank}/5
            </span>
          </DrawerTitle>
          <DrawerDescription>
            {LINEAGE_LABELS[archetype.lineage]} · {TIER_LABELS[archetype.tier]}
            {isActive ? " · Active" : null}
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">
          <ArchetypeDetail entry={entry} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
