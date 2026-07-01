import { Button } from "@workspace/ui/components/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"

export function BottomSheet() {
  return (
    <Drawer defaultOpen direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Rest until dawn?</DrawerTitle>
          <DrawerDescription>
            A full rest restores all HP and SP and readies your Showtime! meter,
            but advances the clock and may draw wandering threats.
          </DrawerDescription>
        </DrawerHeader>
        <div className="grid grid-cols-2 gap-3 px-4 text-sm">
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-muted-foreground">HP restored</div>
            <div className="font-heading text-lg">28 / 28</div>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-muted-foreground">SP restored</div>
            <div className="font-heading text-lg">40 / 40</div>
          </div>
        </div>
        <DrawerFooter>
          <Button>Make camp</Button>
          <DrawerClose render={<Button variant="ghost" />}>
            Keep moving
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
