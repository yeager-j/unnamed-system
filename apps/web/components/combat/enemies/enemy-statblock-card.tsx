import { PlusIcon, SwordIcon } from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"

import { type EnemyDetailView } from "@workspace/game/engine"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { Prose } from "@/components/shared/prose"
import {
  AFFINITY_DAMAGE_TYPE_LABELS,
  AFFINITY_LABELS,
  ATTRIBUTE_LABELS,
  ENEMY_FAMILY_LABELS,
} from "@/lib/ui/labels"

/**
 * Standalone statblock for a catalog enemy in the browse surface (UNN-346).
 *
 * NOTE (end-of-project tech-debt sweep): this rendering deliberately duplicates
 * the enemy statblock shown in the combatant detail drawer (UNN-345) and the
 * signed-out player view (UNN-324). The three are reconciled in the dedup sweep,
 * not here — the browse surface stands alone for now. The shared view-model is
 * {@link import("@/lib/game/enemies").buildEnemyDetailView} (carries the same
 * pointer note).
 */
export function EnemyStatblockCard({
  view,
  onAdd,
}: {
  view: EnemyDetailView
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        <EnemyAvatar name={view.name} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl font-medium">{view.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">Level {view.level}</Badge>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatblockSection title="Vitals">
          <p>
            <span className="font-heading text-3xl font-medium text-hp">
              {view.maxHP}
            </span>{" "}
            <span className="text-sm text-muted-foreground">max HP</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            No SP — catalog monsters start each encounter full.
          </p>
        </StatblockSection>

        <StatblockSection title="Attributes">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {(["strength", "magic", "agility", "luck"] as const).map((key) => (
              <div key={key} className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">
                  {ATTRIBUTE_LABELS[key]}
                </dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    view.attributes[key] < 0 && "text-destructive"
                  )}
                >
                  {formatSigned(view.attributes[key])}
                </dd>
              </div>
            ))}
          </dl>
        </StatblockSection>
      </div>

      <StatblockSection title="Affinities">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {view.affinities.map((cell) => {
            const isNeutral = cell.affinity === "neutral"
            return (
              <div
                key={cell.damageType}
                className={cn(
                  "border px-2.5 py-1.5",
                  cell.affinity === "weak" &&
                    "border-destructive/40 bg-destructive/5"
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {AFFINITY_DAMAGE_TYPE_LABELS[cell.damageType]}
                </p>
                <p
                  className={cn(
                    "text-sm font-medium",
                    isNeutral && "text-muted-foreground/50",
                    cell.affinity === "weak" && "text-destructive"
                  )}
                >
                  {isNeutral ? "—" : AFFINITY_LABELS[cell.affinity]}
                </p>
              </div>
            )
          })}
        </div>
      </StatblockSection>

      {view.talents.length > 0 || view.skills.length > 0 ? (
        <StatblockSection title="Talents & Skills">
          <div className="flex flex-wrap gap-1.5">
            {view.talents.map((talent) => (
              <Badge key={`talent-${talent.key}`} variant="outline">
                {talent.name}
              </Badge>
            ))}
            {view.skills.map((skill) => (
              <Badge key={`skill-${skill.key}`} variant="secondary">
                {skill.name}
              </Badge>
            ))}
          </div>
        </StatblockSection>
      ) : null}

      {view.abilities ? (
        <StatblockSection title="Abilities">
          <Prose>{view.abilities}</Prose>
        </StatblockSection>
      ) : null}
    </div>
  )
}

/** A labelled statblock section — the "VITALS / ATTRIBUTES / …" cards. */
function StatblockSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}
