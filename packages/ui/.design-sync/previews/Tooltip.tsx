import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

export function OnButton() {
  return (
    <TooltipProvider delay={0}>
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="gilded" />}>
          Showtime!
        </TooltipTrigger>
        <TooltipContent>
          Unleash an All-Out Attack — costs 3 Showtime
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
