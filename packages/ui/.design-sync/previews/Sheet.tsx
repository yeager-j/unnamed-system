import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

export function RightPanel() {
  return (
    <Sheet defaultOpen>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Cast a Skill</SheetTitle>
          <SheetDescription>
            Spend SP to unleash a Persona Skill. Ortus Skills strike from range;
            Corpus Skills demand you close the distance.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 text-sm">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="font-medium">Rending Gale</span>
            <span className="text-muted-foreground">12 SP</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="font-medium">Mend Wounds</span>
            <span className="text-muted-foreground">8 SP</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="font-medium">Ashen Bulwark</span>
            <span className="text-muted-foreground">6 SP</span>
          </div>
        </div>
        <SheetFooter>
          <Button>Cast Skill</Button>
          <SheetClose render={<Button variant="ghost" />}>Cancel</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
