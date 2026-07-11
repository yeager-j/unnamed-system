import {
  HeartIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import {
  ENEMY_FAMILIES,
  type EnemyCatalogLevelGroup,
  type EnemyCatalogRow,
  type EnemyFamily,
} from "@/domain/combat/view/enemy-catalog-view"
import {
  AFFINITY_DAMAGE_TYPE_LABELS,
  ENEMY_FAMILY_LABELS,
} from "@/lib/ui/labels"

import { EnemyAvatar } from "./enemy-statblock-card"

/**
 * The master list of the bestiary browse surface (UNN-346): name search, family
 * filter chips (with per-family counts), and rows grouped by level. Virtualizing
 * is deferred — the catalog is on the order of tens of entries; revisit if it
 * grows into the hundreds the AC anticipates.
 */
export function EnemyCatalogList({
  groups,
  familyCounts,
  totalCount,
  filteredCount,
  search,
  onSearchChange,
  family,
  onFamilyChange,
  selectedKey,
  onSelect,
  onAdd,
}: {
  groups: EnemyCatalogLevelGroup[]
  familyCounts: Partial<Record<EnemyFamily, number>>
  totalCount: number
  filteredCount: number
  search: string
  onSearchChange: (value: string) => void
  family: EnemyFamily | null
  onFamilyChange: (family: EnemyFamily | null) => void
  selectedKey: string | null
  onSelect: (key: string) => void
  onAdd: (key: string) => void
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search the bestiary…"
          className="pl-8"
          aria-label="Search the bestiary"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FamilyChip
          label="All"
          count={totalCount}
          active={family === null}
          onClick={() => onFamilyChange(null)}
        />
        {ENEMY_FAMILIES.map((key) => (
          <FamilyChip
            key={key}
            label={ENEMY_FAMILY_LABELS[key]}
            count={familyCounts[key] ?? 0}
            active={family === key}
            onClick={() => onFamilyChange(key)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Sorted by level</span>
        <span>
          {filteredCount} of {totalCount}
        </span>
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No creatures match.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.level} className="mb-3">
              <div className="sticky top-0 z-10 mb-1 flex items-center gap-2 bg-muted px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <span>Level {group.level}</span>
                <span className="font-normal text-muted-foreground/70">
                  {group.rows.length}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {group.rows.map((row) => (
                  <EnemyRow
                    key={row.key}
                    row={row}
                    selected={row.key === selectedKey}
                    onSelect={() => onSelect(row.key)}
                    onAdd={() => onAdd(row.key)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function FamilyChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      <span className={cn(active ? "opacity-70" : "text-muted-foreground")}>
        {count}
      </span>
    </Button>
  )
}

function EnemyRow({
  row,
  selected,
  onSelect,
  onAdd,
}: {
  row: EnemyCatalogRow
  selected: boolean
  onSelect: () => void
  onAdd: () => void
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onSelect()
          }
        }}
        aria-pressed={selected}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 border border-transparent px-2 py-1.5 text-left hover:bg-muted/60",
          selected && "border-border bg-muted"
        )}
      >
        <EnemyAvatar name={row.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>L{row.level}</span>
            <span className="flex items-center gap-0.5">
              <HeartIcon className="size-3" /> {row.maxHP}
            </span>
            {row.weaknesses.map((weakness) => (
              <Badge key={weakness} variant="destructive">
                {AFFINITY_DAMAGE_TYPE_LABELS[weakness]}
              </Badge>
            ))}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Queue ${row.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onAdd()
          }}
        >
          <PlusIcon weight="bold" />
        </Button>
      </div>
    </li>
  )
}
