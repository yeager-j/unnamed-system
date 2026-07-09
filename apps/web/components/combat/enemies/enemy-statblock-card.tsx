import { PlusIcon, SwordIcon } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { EnemyStatblock } from "@/components/combat/enemies/enemy-statblock"
import { DetailSection } from "@/components/shared/detail-section"
import { type EnemyStatblockView } from "@/lib/combat/view/enemy-statblock-view"
import { ENEMY_FAMILY_LABELS } from "@/lib/ui/labels"

/**
 * Standalone statblock for a catalog enemy in the browse surface (UNN-346): the
 * header (name / level / family / add) and Vitals, then the shared
 * {@link EnemyStatblock} body (Attributes / Affinities / Talents / Skills) — the
 * same renderer the DM combat drawer uses, fed by the same
 * {@link EnemyStatblockView} the enemy is projected onto (UNN-350).
 */
export function EnemyStatblockCard({
  view,
  onAdd,
}: {
  view: EnemyStatblockView
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <EnemyAvatar name={view.name} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl font-medium">{view.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {view.level !== null ? (
              <Badge variant="outline">Level {view.level}</Badge>
            ) : null}
            {view.family ? (
              <Badge variant="outline">
                <SwordIcon weight="bold" />
                {ENEMY_FAMILY_LABELS[view.family]}
              </Badge>
            ) : null}
            <Badge variant="secondary">5E Catalog</Badge>
          </div>
        </div>
        <Button
          size="icon-sm"
          aria-label={`Queue ${view.name}`}
          onClick={onAdd}
        >
          <PlusIcon weight="bold" />
        </Button>
      </header>

      <DetailSection title="Vitals">
        <p>
          <span className="font-heading text-3xl font-medium text-hp">
            {view.maxHP}
          </span>{" "}
          <span className="text-sm text-muted-foreground">max HP</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          No SP — catalog monsters start each encounter full.
        </p>
      </DetailSection>

      <EnemyStatblock view={view} />
    </div>
  )
}

/** A square initials token for a catalog enemy (no portraits in the catalog). */
export function EnemyAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center bg-destructive/10 text-sm font-medium text-destructive",
        className
      )}
    >
      {initials(name)}
    </div>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}
