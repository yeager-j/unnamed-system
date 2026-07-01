import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"

export function Movements() {
  return (
    <RadioGroup defaultValue="animus" className="max-w-xs">
      <Label htmlFor="corpus">
        <RadioGroupItem id="corpus" value="corpus" />
        Corpus — the body
      </Label>
      <Label htmlFor="ortus">
        <RadioGroupItem id="ortus" value="ortus" />
        Ortus — the mind
      </Label>
      <Label htmlFor="animus">
        <RadioGroupItem id="animus" value="animus" />
        Animus — the spirit
      </Label>
      <Label htmlFor="persona">
        <RadioGroupItem id="persona" value="persona" />
        Persona — the mask
      </Label>
    </RadioGroup>
  )
}

export function Disabled() {
  return (
    <RadioGroup defaultValue="rest" disabled className="max-w-xs">
      <Label htmlFor="rest">
        <RadioGroupItem id="rest" value="rest" />
        Take a Rest
      </Label>
      <Label htmlFor="cast">
        <RadioGroupItem id="cast" value="cast" />
        Cast a Spell
      </Label>
    </RadioGroup>
  )
}
