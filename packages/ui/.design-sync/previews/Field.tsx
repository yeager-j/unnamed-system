import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"

export function Default() {
  return (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="persona-title">Persona title</FieldLabel>
      <Input id="persona-title" defaultValue="The Understudy" />
      <FieldDescription>
        The name that appears above your actor during Showtime!
      </FieldDescription>
    </Field>
  )
}

export function Invalid() {
  return (
    <Field data-invalid className="max-w-sm">
      <FieldLabel htmlFor="max-sp">Max Spell Points</FieldLabel>
      <Input id="max-sp" defaultValue="-4" aria-invalid />
      <FieldError>Max Spell Points must be a positive number.</FieldError>
    </Field>
  )
}

export function HorizontalSwitch() {
  return (
    <FieldSet className="max-w-sm">
      <FieldLegend variant="label">Table settings</FieldLegend>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="auto-showtime">
            Auto-trigger Showtime!
          </FieldLabel>
          <FieldDescription>
            Fire the All-Out Attack the moment the meter fills.
          </FieldDescription>
        </FieldContent>
        <Switch id="auto-showtime" defaultChecked />
      </Field>
    </FieldSet>
  )
}

export function Group() {
  return (
    <FieldGroup className="max-w-sm">
      <Field>
        <FieldLabel htmlFor="troupe-name">Troupe name</FieldLabel>
        <Input id="troupe-name" defaultValue="The Hollow Players" />
      </Field>
      <Field>
        <FieldLabel htmlFor="lead">Lead actor</FieldLabel>
        <Input id="lead" placeholder="Choose a Persona to headline" />
        <FieldDescription>
          Takes the spotlight when the curtain rises.
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
}
