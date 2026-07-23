"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { characterEntityWrite, CharacterRoot } from "@/domain/character/client"

import { AdjustPoolForm } from "./adjust-pool-controls"

/**
 * A pool-adjust popover: number input + the two signed buttons. Each click is
 * one `damage`/`heal` descriptor — the server merges against its own row, so
 * back-to-back clicks sum (UNN-226 is structural now). Composes the shared
 * {@link AdjustPoolForm}; it adds only the controlled-open coordination (the
 * caller keeps one popover open at a time) and the entity-write dispatch.
 *
 * Rendered by the sheet's rail controls and by the watch view's own-sheet
 * column (UNN-566), which is why it isn't inlined in either.
 */
export function AdjustPoolControl({
  label,
  component,
  positiveLabel,
  negativeLabel,
  open,
  onOpenChange,
}: {
  label: string
  component: "vitals" | "skillPool"
  positiveLabel: string
  negativeLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const root = CharacterRoot.useRoot()

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant={open ? "secondary" : "outline"}
            size="sm"
            className="w-full"
          />
        }
      >
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-56 flex-col gap-2 p-3">
        <AdjustPoolForm
          inputId={`${label}-amount`}
          decrementLabel={negativeLabel}
          incrementLabel={positiveLabel}
          onDecrement={(amount) =>
            root.mutate(
              characterEntityWrite({
                entityId: root.value.profile.id,
                write: { component, op: "damage", amount },
              })
            )
          }
          onIncrement={(amount) =>
            root.mutate(
              characterEntityWrite({
                entityId: root.value.profile.id,
                write: { component, op: "heal", amount },
              })
            )
          }
          onAfterSubmit={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
