import { cn } from "@workspace/ui/lib/utils"

/**
 * The shared `<section>` + small-caps-label wrapper used by every block on the
 * Archetypes tab. Centralizes the uppercase-tracking-wide muted-foreground
 * heading class string so the six places it used to live in stay in sync; also
 * the home of the inline-label variant the compact summary's chip rows reuse.
 *
 * - Default block layout (label above content, vertical gap).
 * - `aside`: optional right-aligned content rendered alongside the title — used
 *   for e.g. an `N/total filled` counter on the Inheritance Slots section.
 * - `inline`: wrap-row variant where the label rides at the front of a single
 *   flex line (used by `ChipRow` in the compact summary). `aside` is ignored
 *   in this variant because there's no header to ride alongside.
 */
export function DetailSection({
  title,
  aside,
  inline = false,
  className,
  children,
}: {
  title: string
  aside?: React.ReactNode
  inline?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (inline) {
    return (
      <div
        className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}
      >
        <DetailSectionLabel>{title}</DetailSectionLabel>
        {children}
      </div>
    )
  }
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {aside ? (
        <div className="flex items-baseline justify-between gap-2">
          <DetailSectionLabel>{title}</DetailSectionLabel>
          {aside}
        </div>
      ) : (
        <DetailSectionLabel>{title}</DetailSectionLabel>
      )}
      {children}
    </section>
  )
}

function DetailSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  )
}
