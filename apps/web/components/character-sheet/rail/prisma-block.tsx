"use client"

import { FlaskIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { OwnerOnly } from "@/components/shell/viewer-role"
import type { RailPrisma } from "@/domain/character/view/rail-view"
import { useEntityWrite } from "@/domain/entity/use-entity-write"

/**
 * The rail's Prisma flask (design handoff + rulebook 2.6): heal-per-charge,
 * charge pips, and the owner's Use control (a Standard Action at the table —
 * the sheet just tracks the spend). `usePrisma` refuses at zero charges, so
 * the button also disables there.
 */
export function PrismaBlock({ view }: { view: RailPrisma }) {
  const { dispatch } = useEntityWrite()

  return (
    <section
      aria-label="Prisma"
      className="flex items-center justify-between gap-2 rounded-md border bg-background/60 px-2.5 py-2"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1 text-xs font-semibold">
          <FlaskIcon className="size-3.5 text-primary" aria-hidden />
          Prisma
        </span>
        <span className="text-xs text-muted-foreground">
          {view.healFormula} HP per charge
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1"
          role="meter"
          aria-label={`${view.current} of ${view.max} Prisma charges`}
          aria-valuenow={view.current}
          aria-valuemin={0}
          aria-valuemax={view.max}
        >
          {Array.from({ length: view.max }, (_, index) => (
            <span
              key={index}
              className={cn(
                "size-2.5 rounded-full",
                index < view.current ? "bg-primary" : "border bg-muted"
              )}
            />
          ))}
        </div>
        <OwnerOnly>
          <Button
            size="sm"
            variant="outline"
            disabled={view.current === 0}
            onClick={() =>
              dispatch({ component: "resources", op: "usePrisma" })
            }
          >
            Use
          </Button>
        </OwnerOnly>
      </div>
    </section>
  )
}
