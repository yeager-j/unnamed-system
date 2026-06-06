"use client"

import { TrashIcon } from "@phosphor-icons/react"

import { type StainsState } from "@workspace/game/engine"
import { Button } from "@workspace/ui/components/button"

import { useViewerRole } from "@/components/shell/viewer-role"

import { OwnerStainSlot, StainTile } from "./mage/stain-slot"
import { useStainsControls } from "./mage/use-stains-controls"

/**
 * Mage — Stains rendering. Four equal-width tiles, each showing its current
 * element (Fire / Ice / Elec / Wind / Light) or empty. Non-owners see the
 * tiles read-only; owners get per-slot controls (UNN-229): every tile is a
 * popover to fill / replace / remove a Stain, plus a one-click Clear.
 */
export function StainsWidget({ state }: { state: StainsState }) {
  const role = useViewerRole()

  if (role !== "owner") {
    return (
      <ol aria-label="Stain slots" className="grid grid-cols-4 gap-2">
        {state.tokens.map((token, index) => (
          <StainTile key={index} token={token} />
        ))}
      </ol>
    )
  }

  return <OwnerStains tokens={state.tokens} />
}

function OwnerStains({ tokens }: { tokens: StainsState["tokens"] }) {
  const { clear, pending } = useStainsControls()
  const hasStains = tokens.some((token) => token !== null)

  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Stain slots" className="grid grid-cols-4 gap-2">
        {tokens.map((token, index) => (
          <OwnerStainSlot key={index} slotIndex={index} token={token} />
        ))}
      </ol>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          aria-label="Clear all Stains"
          disabled={pending || !hasStains}
          onClick={clear}
        >
          <TrashIcon weight="bold" aria-hidden />
          Clear
        </Button>
      </div>
    </div>
  )
}
