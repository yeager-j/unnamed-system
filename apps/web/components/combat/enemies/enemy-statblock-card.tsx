import { PlusIcon, SwordIcon } from "@phosphor-icons/react/dist/ssr"

import { type Statblock } from "@workspace/game/engine"
import { type EnemyFamily } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { EnemyStatblock } from "@/components/combat/enemies/enemy-statblock"
import { DetailSection } from "@/components/shared/detail-section"
import { ENEMY_FAMILY_LABELS } from "@/lib/ui/labels"

/**
 * Standalone statblock for a catalog enemy in the browse surface (UNN-346): the
 * header (name / level / family / add) and Vitals, then the shared
 * {@link EnemyStatblock} body (Attributes / Affinities / Talents / Skills /
 * Abilities) — the same renderer the DM combat drawer uses, fed by the same
 * {@link Statblock} (UNN-350). `family` is passed alongside because it is a
 * property of where the entry lives in the catalog, not of the statblock.
 */
export function EnemyStatblockCard({
  statblock,
  family,
  onAdd,
}: {
  statblock: Statblock
  family: EnemyFamily | null
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <EnemyAvatar name={statblock.name} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl font-medium">
            {statblock.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {statblock.level !== null ? (
              <Badge variant="outline">Level {statblock.level}</Badge>
            ) : null}
            {family ? (
              <Badge variant="outline">
                <SwordIcon weight="bold" />
                {ENEMY_FAMILY_LABELS[family]}
              </Badge>
            ) : null}
            <Badge variant="secondary">5E Catalog</Badge>
          </div>
        </div>
        <Button
          size="icon-sm"
          aria-label={`Queue ${statblock.name}`}
          onClick={onAdd}
        >
          <PlusIcon weight="bold" />
        </Button>
      </header>

      <DetailSection title="Vitals">
        <p>
          <span className="font-heading text-3xl font-medium text-hp">
            {statblock.maxHP}
          </span>{" "}
          <span className="text-sm text-muted-foreground">max HP</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          No SP — catalog monsters start each encounter full.
        </p>
      </DetailSection>

      <EnemyStatblock statblock={statblock} />
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
