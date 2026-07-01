import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

export function Default() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="background">Background</Label>
      <Textarea
        id="background"
        defaultValue="Raised backstage at the Hollow Theater, the understudy learned every role but was never once called to perform."
      />
    </div>
  )
}

export function WithPlaceholder() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="scene-notes">Scene notes</Label>
      <Textarea
        id="scene-notes"
        placeholder="Describe how the Persona enters the spotlight..."
      />
    </div>
  )
}

export function Disabled() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="epilogue">Epilogue</Label>
      <Textarea
        id="epilogue"
        defaultValue="Sealed until the campaign concludes."
        disabled
      />
    </div>
  )
}

export function Invalid() {
  return (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="oath">Chain oath</Label>
      <Textarea id="oath" defaultValue="" aria-invalid />
      <p className="text-sm text-destructive">
        Every Chain must be bound by a spoken oath.
      </p>
    </div>
  )
}
