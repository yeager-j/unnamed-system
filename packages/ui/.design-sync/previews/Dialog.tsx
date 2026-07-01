import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

export function Open() {
  return (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rest at camp?</DialogTitle>
          <DialogDescription>
            Resting restores HP and SP but advances the clock. Wandering threats
            may find you before dawn.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Not yet</DialogClose>
          <DialogClose render={<Button />}>Make camp</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
