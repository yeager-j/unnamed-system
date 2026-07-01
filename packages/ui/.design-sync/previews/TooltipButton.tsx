import { TooltipButton } from "@workspace/ui/components/tooltip-button"

export function Enabled() {
  return <TooltipButton>Cast Spell</TooltipButton>
}

export function Disabled() {
  return (
    <TooltipButton disabled disabledReason="Not enough SP to cast Agilao.">
      Cast Spell
    </TooltipButton>
  )
}

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <TooltipButton variant="gilded">Showtime!</TooltipButton>
      <TooltipButton
        variant="outline"
        disabled
        disabledReason="Equip slot is locked until Level 5."
      >
        Equip
      </TooltipButton>
    </div>
  )
}
