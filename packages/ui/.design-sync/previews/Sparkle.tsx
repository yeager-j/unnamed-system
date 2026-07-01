import { Sparkle } from "@workspace/ui/components/celestial"

export function Gilt() {
  return (
    <div className="flex items-center gap-4 text-gold">
      <Sparkle className="size-4" />
      <Sparkle className="size-6" />
      <Sparkle className="size-8" />
      <Sparkle className="size-12" />
    </div>
  )
}

export function AsFlourish() {
  return (
    <div className="flex items-center gap-2 text-gold">
      <Sparkle className="size-4" />
      <span className="font-display text-2xl text-foreground">Prime Time</span>
      <Sparkle className="size-4" />
    </div>
  )
}
