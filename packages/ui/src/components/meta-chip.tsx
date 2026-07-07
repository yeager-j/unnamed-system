import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const metaChipVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] leading-tight",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/40 text-foreground",
        muted: "border-border bg-transparent text-muted-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

/**
 * A compact labelled stat chip — `Range Line`, `Cost 4 SP`, `Targets 2` — for
 * dense metadata rows (skill cards, statblocks). The label reads muted, the
 * value carries the weight; a chip with no value renders the label alone at
 * full strength.
 */
function MetaChip({
  label,
  value,
  variant,
  className,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof metaChipVariants> & {
    label: string
    value?: React.ReactNode
  }) {
  return (
    <span
      data-slot="meta-chip"
      className={cn(metaChipVariants({ variant }), className)}
      {...props}
    >
      {value === undefined ? (
        <span className="font-medium">{label}</span>
      ) : (
        <>
          <span className="font-mono text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
            {label}
          </span>
          <span className="font-medium">{value}</span>
        </>
      )}
    </span>
  )
}

export { MetaChip, metaChipVariants }
