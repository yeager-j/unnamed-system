import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

export function WithInput() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="movement">Active movement</Label>
      <Input id="movement" defaultValue="Animus" />
    </div>
  )
}

export function WithCheckbox() {
  return (
    <Label htmlFor="ready">
      <Checkbox id="ready" defaultChecked />
      Ready for Showtime!
    </Label>
  )
}

export function Disabled() {
  return (
    <div className="group grid max-w-sm gap-2" data-disabled="true">
      <Label htmlFor="locked-sp">Spell Points</Label>
      <Input id="locked-sp" defaultValue="18 / 18" disabled />
    </div>
  )
}
