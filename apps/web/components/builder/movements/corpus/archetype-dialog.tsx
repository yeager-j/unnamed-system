"use client"

import { useRef } from "react"

import { type Archetype, type PathChoice } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"
import { useLastPresent } from "@workspace/ui/hooks/use-last-present"

import { ArchetypeDetailHeader } from "@/components/archetype/archetype-detail-header"

import { ArchetypeDetail } from "./archetype-detail"

/**
 * The Movement 1 Origin Archetype detail surface (UNN-215). A
 * {@link ResponsiveDialog} — a right-side Sheet on desktop, a bottom Drawer on
 * mobile — opened by tapping a compact {@link ArchetypeCard} in the grid.
 * Modeled on the Lineage Atlas's `ArchetypeDetailPanel`: the shared
 * `components/archetype/` kit renders the body (via {@link ArchetypeDetail}) and
 * the footer holds the commit CTA.
 *
 * Choosing dispatches the optimistic Origin write (`onChoose`) and closes the
 * dialog. Re-opening the already-chosen Archetype shows a disabled "{Name}
 * chosen" footer — the same semantics the old viewport-sticky bar had.
 */
export function ArchetypeDialog({
  archetype,
  pathChoice,
  selected,
  pending,
  onChoose,
  onClose,
}: {
  archetype: Archetype | null
  pathChoice: PathChoice
  selected: boolean
  pending: boolean
  onChoose: () => void
  onClose: () => void
}) {
  const shown = useLastPresent(archetype)
  return (
    <ResponsiveDialog
      open={archetype !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {shown ? (
        <PanelBody
          archetype={shown}
          pathChoice={pathChoice}
          selected={selected}
          pending={pending}
          onChoose={onChoose}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveDialog>
  )
}

function PanelBody({
  archetype,
  pathChoice,
  selected,
  pending,
  onChoose,
  onClose,
}: {
  archetype: Archetype
  pathChoice: PathChoice
  selected: boolean
  pending: boolean
  onChoose: () => void
  onClose: () => void
}) {
  // Focus the header on open rather than letting the dialog auto-focus the
  // first tabbable element — the footer CTA — which would scroll the panel to
  // the bottom on open.
  const headerRef = useRef<HTMLDivElement>(null)

  return (
    <ResponsiveDialogContent
      initialFocusRef={headerRef}
      className="data-[side=right]:sm:max-w-2xl"
    >
      <ResponsiveDialogHeader ref={headerRef}>
        <ArchetypeDetailHeader
          archetype={archetype}
          titleAs={ResponsiveDialogTitle}
          subtitleAs={ResponsiveDialogDescription}
          trailing={
            selected ? <Badge className="shrink-0">Origin</Badge> : null
          }
        />
      </ResponsiveDialogHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
        <ArchetypeDetail archetype={archetype} pathChoice={pathChoice} />
      </div>

      <ResponsiveDialogFooter className="flex-row items-center justify-end border-t">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          variant={selected ? "secondary" : "default"}
          disabled={selected || pending}
          onClick={onChoose}
        >
          {selected
            ? `${archetype.name} chosen`
            : `Choose ${archetype.name} as Origin`}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialogContent>
  )
}
