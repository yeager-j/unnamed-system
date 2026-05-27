import {
  PopoverDescription,
  PopoverTitle,
} from "@workspace/ui/components/popover"

/**
 * The card frame shared by every popover body on the sheet (Skill, intrinsic
 * attack, and future inventory item popovers). Renders the header — title,
 * optional subtitle, and a right-aligned badge slot — then drops into the
 * children slot for the card body.
 *
 * The badge is supplied by the caller so attack surfaces can render a tinted
 * {@link DamageTypeBadge} while non-attack surfaces render an outline kind
 * chip without the shell knowing the distinction.
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
  badge,
  children,
}: {
  title: string
  subtitle?: string
  badge: React.ReactNode
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
        <span className="shrink-0">{badge}</span>
      </div>
      {children}
    </div>
  )
}
