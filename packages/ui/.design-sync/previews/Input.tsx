import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

export function Default() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="persona-name">Persona name</Label>
      <Input id="persona-name" defaultValue="The Understudy" />
    </div>
  )
}

export function WithPlaceholder() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="stage-name">Stage name</Label>
      <Input id="stage-name" placeholder="e.g. The Gilded Knife" />
    </div>
  )
}

export function Disabled() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="troupe">Troupe</Label>
      <Input id="troupe" defaultValue="Locked during Showtime!" disabled />
    </div>
  )
}

export function Invalid() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="hp">Current HP</Label>
      <Input id="hp" defaultValue="52" aria-invalid />
      <p className="text-sm text-destructive">HP cannot exceed max HP of 40.</p>
    </div>
  )
}
