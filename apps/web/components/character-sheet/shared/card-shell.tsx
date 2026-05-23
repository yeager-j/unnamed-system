import { Badge } from "@workspace/ui/components/badge"

/**
 * The popover card frame shared by the Skill, intrinsic-attack, and (future)
 * inventory item popovers. Renders the header — title, optional subtitle, and
 * the right-aligned kind badge — then drops into the children slot for the
 * card body.
 */
export function CardShell({
  title,
  subtitle,
  kindLabel,
  children,
}: {
  title: string
  subtitle?: string
  kindLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="text-base leading-tight font-semibold">{title}</h3>
          {subtitle ? (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        <Badge variant="outline" className="shrink-0">
          {kindLabel}
        </Badge>
      </div>
      {children}
    </div>
  )
}
