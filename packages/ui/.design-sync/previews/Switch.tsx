import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

export function Off() {
  return (
    <Label htmlFor="prime-time">
      <Switch id="prime-time" />
      Prime Time available
    </Label>
  )
}

export function On() {
  return (
    <Label htmlFor="spotlight">
      <Switch id="spotlight" defaultChecked />
      Spotlight on this actor
    </Label>
  )
}

export function Small() {
  return (
    <Label htmlFor="concentrating">
      <Switch id="concentrating" size="sm" defaultChecked />
      Concentrating
    </Label>
  )
}

export function Disabled() {
  return (
    <div className="grid gap-3">
      <Label htmlFor="downed">
        <Switch id="downed" disabled />
        Reactions (downed)
      </Label>
      <Label htmlFor="charged">
        <Switch id="charged" defaultChecked disabled />
        Charged (locked in)
      </Label>
    </div>
  )
}
