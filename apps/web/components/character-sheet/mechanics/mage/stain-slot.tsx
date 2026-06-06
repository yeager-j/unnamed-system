"use client"

import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useState } from "react"

import {
  STAIN_ELEMENTS,
  type StainElement,
  type StainsState,
} from "@workspace/game/engine"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { STAIN_ELEMENT_LABELS } from "@/lib/ui/labels"

import { useStainsControls } from "./use-stains-controls"

type StainToken = StainsState["tokens"][number]

/**
 * Element → tile styling, shared by the read-only tiles and the picker
 * swatches so the colour vocabulary has one source. Picks up the elemental
 * affinity palette so a row scans at a glance.
 */
const STAIN_TILE_CLASSES = {
  fire: "border-orange-400 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ice: "border-sky-400 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  elec: "border-yellow-400 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  wind: "border-emerald-400 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  light: "border-amber-300 bg-amber-200/40 text-amber-800 dark:text-amber-200",
} as const satisfies Record<StainElement, string>

const TILE_BASE =
  "flex h-16 w-full items-center justify-center rounded-md border-2 font-medium"
const EMPTY_TILE =
  "flex h-16 w-full items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground"

function tileClassName(token: StainToken): string {
  return token ? `${TILE_BASE} ${STAIN_TILE_CLASSES[token]}` : EMPTY_TILE
}

/** Read-only tile, also the visual base the owner trigger reuses. */
export function StainTile({ token }: { token: StainToken }) {
  return (
    <li className={tileClassName(token)}>
      {token ? STAIN_ELEMENT_LABELS[token] : "—"}
    </li>
  )
}

/**
 * Owner-mode tile: the tile itself is the popover trigger. An empty slot shows
 * a `+`; opening it offers the five elements (the current one marked) to fill
 * or replace, plus Remove when the slot is filled. Replacing a slot while all
 * four are full is the same gesture — there is no separate "add", so a full
 * Mage necessarily picks which Stain to overwrite.
 */
export function OwnerStainSlot({
  slotIndex,
  token,
}: {
  slotIndex: number
  token: StainToken
}) {
  const { setSlot, pending } = useStainsControls()
  const [open, setOpen] = useState(false)

  const triggerLabel = token
    ? `Stain slot ${slotIndex + 1}, ${STAIN_ELEMENT_LABELS[token]} — change or remove`
    : `Stain slot ${slotIndex + 1}, empty — add a Stain`

  function choose(element: StainElement | null) {
    setOpen(false)
    if (element === token) return
    setSlot(slotIndex, element)
  }

  return (
    <li>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={triggerLabel}
              disabled={pending}
              className={cn(
                tileClassName(token),
                "cursor-pointer transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {token ? (
                STAIN_ELEMENT_LABELS[token]
              ) : (
                <PlusIcon weight="bold" aria-hidden />
              )}
            </button>
          }
        />
        <PopoverContent align="center" sideOffset={6} className="w-60 gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {token ? "Change Stain" : "Add a Stain"}
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {STAIN_ELEMENTS.map((element) => (
              <button
                key={element}
                type="button"
                aria-label={STAIN_ELEMENT_LABELS[element]}
                aria-pressed={element === token}
                onClick={() => choose(element)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-md border-2 text-[11px] font-medium",
                  STAIN_TILE_CLASSES[element],
                  element === token
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-popover"
                    : "hover:brightness-105"
                )}
              >
                {STAIN_ELEMENT_LABELS[element]}
              </button>
            ))}
          </div>
          {token ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => choose(null)}
            >
              <TrashIcon weight="bold" aria-hidden />
              Remove Stain
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </li>
  )
}
