import { Eye, Shield, Sparkle } from "@phosphor-icons/react"

import { Toggle } from "@workspace/ui/components/toggle"

export function States() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toggle>Concentrating</Toggle>
      <Toggle defaultPressed>Charged</Toggle>
    </div>
  )
}

export function Outline() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toggle variant="outline">
        <Shield />
        Defending
      </Toggle>
      <Toggle variant="outline" defaultPressed>
        <Sparkle />
        Inspired
      </Toggle>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toggle size="sm" variant="outline">
        <Eye />
        Sm
      </Toggle>
      <Toggle size="default" variant="outline" defaultPressed>
        <Eye />
        Default
      </Toggle>
      <Toggle size="lg" variant="outline">
        <Eye />
        Lg
      </Toggle>
    </div>
  )
}
