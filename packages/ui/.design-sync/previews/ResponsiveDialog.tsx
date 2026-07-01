import { Button } from "@workspace/ui/components/button"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"

export function Open() {
  return (
    <ResponsiveDialog open>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Advance to Prime Time?</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Your Persona has reached the threshold. Committing now unlocks a new
            Synthesis Skill and reshapes your Animus movement.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="flex flex-col gap-2 px-4 text-sm">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-muted-foreground">New Skill</span>
            <span className="font-medium">Crescendo Strike</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-muted-foreground">Movement</span>
            <span className="font-medium">Animus III</span>
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button>Enter Prime Time</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
