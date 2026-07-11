"use client"

import { useState } from "react"

import {
  STAIN_ELEMENTS,
  type StainElement,
  type StainsState,
} from "@workspace/game-v2/mechanics/mage/stains"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { elementTone } from "@/components/shared/element-tokens"
import { OwnerOnly, useViewerRole } from "@/components/shell/viewer-role"
import { useEntityWrite } from "@/domain/entity/use-entity-write"
import { DAMAGE_TYPE_LABELS } from "@/lib/ui/labels"

import { WidgetHeader } from "./widget-chrome"

/**
 * Mage — Stains: four slots each holding an element token (or empty). A slot
 * writes individually (`setSlot` — per-field discipline at slot granularity),
 * via a small element picker; Clear empties the palette.
 */
export function StainsWidget({ state }: { state: StainsState }) {
  const role = useViewerRole()
  const { dispatch, pending } = useEntityWrite()

  const write = (transition: unknown) =>
    dispatch({ component: "mechanics", mechanic: "stains", transition })

  const filled = state.tokens.filter((token) => token !== null).length

  return (
    <>
      <WidgetHeader name="Stains" value={`${filled}/${state.tokens.length}`} />
      <div className="grid grid-cols-4 gap-1.5">
        {state.tokens.map((token, index) =>
          role === "owner" ? (
            <StainSlotPicker
              key={index}
              index={index}
              token={token}
              pending={pending}
              onPick={(element) =>
                write({ op: "setSlot", slotIndex: index, element })
              }
            />
          ) : (
            <StainToken key={index} token={token} />
          )
        )}
      </div>
      {filled > 0 ? (
        <OwnerOnly>
          <Button
            size="sm"
            variant="ghost"
            className="self-end"
            disabled={pending}
            onClick={() => write({ op: "clear" })}
          >
            Clear
          </Button>
        </OwnerOnly>
      ) : null}
    </>
  )
}

function StainToken({ token }: { token: StainElement | null }) {
  return (
    <span
      className={cn(
        "flex h-8 items-center justify-center rounded-md border text-[10px] font-semibold uppercase",
        token ? elementTone(token).chip : "border-dashed text-muted-foreground"
      )}
    >
      {token ? DAMAGE_TYPE_LABELS[token] : "—"}
    </span>
  )
}

function StainSlotPicker({
  index,
  token,
  pending,
  onPick,
}: {
  index: number
  token: StainElement | null
  pending: boolean
  onPick: (element: StainElement | null) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Stain slot ${index + 1}`}
        disabled={pending}
        className={cn(
          "flex h-8 items-center justify-center rounded-md border text-[10px] font-semibold uppercase transition-colors hover:border-primary/60",
          token
            ? elementTone(token).chip
            : "border-dashed text-muted-foreground"
        )}
      >
        {token ? DAMAGE_TYPE_LABELS[token] : "—"}
      </PopoverTrigger>
      <PopoverContent className="grid w-44 grid-cols-2 gap-1 p-1.5">
        {STAIN_ELEMENTS.map((element) => (
          <button
            key={element}
            type="button"
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium",
              elementTone(element).chip
            )}
            onClick={() => {
              onPick(element)
              setOpen(false)
            }}
          >
            {DAMAGE_TYPE_LABELS[element]}
          </button>
        ))}
        {token ? (
          <button
            type="button"
            className="col-span-2 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => {
              onPick(null)
              setOpen(false)
            }}
          >
            Empty slot
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
