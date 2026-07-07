import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const metaChipVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs leading-tight font-extrabold uppercase",
  {
    variants: {
      variant: {
        default:
          "border-border bg-muted/40 text-foreground [&>span]:text-muted-foreground",
        muted: "border-border bg-transparent text-muted-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
        hp: "border-emerald-400/40 bg-emerald-400/10 [&>span]:text-emerald-300",
        sp: "border-blue-400/40 bg-blue-400/10 [&>span]:text-blue-300",
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
        <span>{label}</span>
      ) : (
        <>
          <span>{label}</span>
          {value}
        </>
      )}
    </span>
  )
}

export { MetaChip, metaChipVariants }
