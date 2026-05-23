import { Badge } from "@workspace/ui/components/badge"
import {
  PopoverDescription,
  PopoverTitle,
} from "@workspace/ui/components/popover"

/**
 * The card frame shared by every popover body on the sheet (Skill, intrinsic
 * attack, and future inventory item popovers). Renders the header — title,
 * optional subtitle, and the right-aligned kind badge — then drops into the
 * children slot for the card body.
 *
 * Uses Base UI's {@link PopoverTitle} / {@link PopoverDescription} so the
 * popover popup is automatically `aria-labelledby` / `aria-describedby` the
 * header. Therefore must be rendered inside a `<Popover.Root>` — for a
 * non-popover card surface (e.g. an unhydrated skill directory), use a
 * separate component.
 */
export function PopoverCardShell({
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
          <PopoverTitle className="text-base leading-tight font-semibold">
            {title}
          </PopoverTitle>
          {subtitle ? (
            <PopoverDescription className="text-xs">
              {subtitle}
            </PopoverDescription>
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
