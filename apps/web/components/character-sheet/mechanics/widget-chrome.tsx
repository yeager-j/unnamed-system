"use client"

import { MinusIcon, PlusIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"

import { OwnerOnly } from "@/components/shell/viewer-role"

/** The widget's header row: mechanic name left, the marquee value right. */
export function WidgetHeader({
  name,
  value,
}: {
  name: string
  value?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-semibold">{name}</span>
      {value !== undefined ? (
        <span className="font-display text-lg text-gold tabular-nums">
          {value}
        </span>
      ) : null}
    </div>
  )
}

/** An owner-only ± stepper pair, the shape every counter mechanic shares. */
export function WidgetStepper({
  label,
  onAdjust,
  decrementDisabled,
  incrementDisabled,
  pending,
}: {
  label: string
  onAdjust: (delta: number) => void
  decrementDisabled: boolean
  incrementDisabled: boolean
  pending: boolean
}) {
  return (
    <OwnerOnly>
      <div className="flex items-center justify-end gap-1">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Decrease ${label}`}
          disabled={pending || decrementDisabled}
          onClick={() => onAdjust(-1)}
        >
          <MinusIcon aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Increase ${label}`}
          disabled={pending || incrementDisabled}
          onClick={() => onAdjust(1)}
        >
          <PlusIcon aria-hidden />
        </Button>
      </div>
    </OwnerOnly>
  )
}
