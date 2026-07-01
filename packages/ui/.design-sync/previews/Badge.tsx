import { Badge } from "@workspace/ui/components/badge"

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Prime Time</Badge>
      <Badge variant="secondary">Level 4</Badge>
      <Badge variant="destructive">Downed</Badge>
      <Badge variant="outline">Ortus</Badge>
      <Badge variant="ghost">Optional</Badge>
      <Badge variant="link">View skill</Badge>
    </div>
  )
}

export function Vitals() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="hp">HP 24 / 30</Badge>
      <Badge variant="sp">SP 12 / 18</Badge>
      <Badge variant="engaged">Engaged</Badge>
    </div>
  )
}

export function Movements() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">Corpus</Badge>
      <Badge variant="secondary">Ortus</Badge>
      <Badge variant="secondary">Animus</Badge>
      <Badge variant="secondary">Persona</Badge>
    </div>
  )
}
