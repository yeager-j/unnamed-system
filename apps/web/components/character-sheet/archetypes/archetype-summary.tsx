"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@workspace/ui/components/responsive-dialog"

import { ArchetypeDetailHeader } from "@/components/archetype/archetype-detail-header"
import type { ArchetypeEntry } from "@/lib/game/archetypes"
import type { AttributeScores } from "@/lib/game/character"

import { ArchetypeDetail } from "./archetype-detail"
import { ArchetypeSummaryRow } from "./archetype-summary-row"

/**
 * One Archetype's compact entry in the Lineage-grouped list, wrapped with the
 * {@link ResponsiveDialog} that opens the full {@link ArchetypeDetail} —
 * a bottom Drawer on mobile, a right-side Sheet on desktop. Composes
 * {@link ArchetypeSummaryRow} (the compact card body) with a "Show details"
 * trigger.
 *
 * Used for *every* unlocked Archetype; the active one carries an `Active`
 * badge so the Lineage grid stays coherent while the featured Active card
 * above provides the spotlight view.
 *
 * `attributes` flows through to the detail body so the Skill popovers there
 * hydrate against the active character's scores.
 */
export function ArchetypeSummary({
  entry,
  attributes,
}: {
  entry: ArchetypeEntry
  attributes: AttributeScores
}) {
  const { archetype, row, isActive } = entry

  return (
    <ResponsiveDialog>
      <ArchetypeSummaryRow
        entry={entry}
        trigger={
          <ResponsiveDialogTrigger>
            <Button variant="ghost" size="sm">
              Show details
            </Button>
          </ResponsiveDialogTrigger>
        }
      />
      <ResponsiveDialogContent className="data-[side=right]:sm:max-w-xl">
        <ResponsiveDialogHeader>
          <ArchetypeDetailHeader
            archetype={archetype}
            rank={row.rank}
            titleAs={ResponsiveDialogTitle}
            subtitleAs={ResponsiveDialogDescription}
            trailing={isActive ? <Badge>Active</Badge> : null}
          />
        </ResponsiveDialogHeader>
        <div className="overflow-y-auto px-4 pb-8">
          <ArchetypeDetail entry={entry} attributes={attributes} />
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
