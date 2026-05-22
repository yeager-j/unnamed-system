"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

/**
 * The "Create new character" CTA. Disabled until the Character Builder ships
 * (PRD §5). A tooltip explains *why* so the affordance does not look broken;
 * a Base UI `Tooltip` will not anchor to a disabled button, so the trigger
 * wraps the button in a `<span>` that retains hover/focus targets.
 */
export function CreateCharacterButton({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} tabIndex={0} />}>
        <Button disabled>
          <PlusIcon weight="bold" />
          Create new character
        </Button>
      </TooltipTrigger>
      <TooltipContent>Character Builder coming soon</TooltipContent>
    </Tooltip>
  )
}
