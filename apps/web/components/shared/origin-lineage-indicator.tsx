import { CompassIcon } from "@phosphor-icons/react"

export function OriginLineageIndicator() {
  return (
    <span className="flex items-center gap-1 text-xs font-bold text-primary-text uppercase">
      <CompassIcon className="size-4" weight="bold" />
      Origin Lineage
    </span>
  )
}
