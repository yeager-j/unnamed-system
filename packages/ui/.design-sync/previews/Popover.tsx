import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

export function SkillDetails() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="outline" />}>
        Rending Gale
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Rending Gale</PopoverTitle>
          <PopoverDescription>
            Ortus Skill — a lash of cutting wind that strikes at range.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost</span>
            <span className="font-medium">12 SP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Damage</span>
            <span className="font-medium">2d6 Slashing</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Range</span>
            <span className="font-medium">Near</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
