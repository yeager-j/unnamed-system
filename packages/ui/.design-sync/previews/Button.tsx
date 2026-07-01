import { Button } from "@workspace/ui/components/button"

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Cast Spell</Button>
      <Button variant="secondary">Defend</Button>
      <Button variant="outline">Inspect</Button>
      <Button variant="ghost">Skip Turn</Button>
      <Button variant="destructive">Discard</Button>
      <Button variant="link">View rules</Button>
    </div>
  )
}

export function Gilded() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="gilded">Showtime!</Button>
      <Button variant="gilded" size="lg">
        All-Out Attack
      </Button>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  )
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Cast Spell</Button>
      <Button variant="outline" disabled>
        Inspect
      </Button>
    </div>
  )
}
