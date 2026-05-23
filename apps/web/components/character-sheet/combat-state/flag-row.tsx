import { Badge } from "@workspace/ui/components/badge"

export function FlagRow({
  charged,
  concentrating,
}: {
  charged: boolean
  concentrating: boolean
}) {
  if (!charged && !concentrating) return null
  return (
    <div className="flex flex-wrap gap-2">
      {charged ? <Badge variant="secondary">Charged</Badge> : null}
      {concentrating ? <Badge variant="secondary">Concentrating</Badge> : null}
    </div>
  )
}
