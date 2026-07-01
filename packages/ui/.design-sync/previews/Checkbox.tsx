import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"

export function Unchecked() {
  return (
    <Label htmlFor="follow-up">
      <Checkbox id="follow-up" />
      Declare a Follow-Up
    </Label>
  )
}

export function Checked() {
  return (
    <Label htmlFor="showtime">
      <Checkbox id="showtime" defaultChecked />
      Showtime! meter is full
    </Label>
  )
}

export function Disabled() {
  return (
    <div className="grid gap-3">
      <Label htmlFor="cast-locked">
        <Checkbox id="cast-locked" disabled />
        Cast Spell (no SP remaining)
      </Label>
      <Label htmlFor="rest-locked">
        <Checkbox id="rest-locked" defaultChecked disabled />
        Rest taken this scene
      </Label>
    </div>
  )
}
