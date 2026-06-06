import { LockSimpleIcon } from "@phosphor-icons/react"

import { MASTERY_RANK, type AtlasNode } from "@workspace/game/engine"
import { ATTRIBUTE_KEYS } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { ArchetypeAffinityChips } from "@/components/archetype/archetype-affinity-chips"
import { formatModifier } from "@/components/archetype/format"
import {
  ATTRIBUTE_LABELS,
  LINEAGE_DISPLAY,
  TIER_LABELS,
  TIER_ROMAN_LABELS,
} from "@/lib/ui/labels"
import { LINEAGE_ICONS } from "@/lib/ui/lineage-icons"

/** The state pill in a node card's footer. */
function StateBadge({ state }: { state: AtlasNode["state"] }) {
  switch (state.kind) {
    case "unlockable":
      return <Badge variant="outline">Unlockable</Badge>
    case "locked":
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <LockSimpleIcon weight="bold" /> Locked
        </Badge>
      )
    case "owned":
      return (
        <Badge variant="secondary">
          Rank {state.rank}/{MASTERY_RANK}
        </Badge>
      )
    case "mastered":
      return <Badge>Mastered</Badge>
  }
}

/**
 * One Archetype in the Lineage tree: name, tier, key Affinity chips, the
 * Attribute spread, and the {@link StateBadge}. The whole card is a button that
 * opens the detail panel; `selected` rings the active one. State styling keeps
 * locked nodes muted and owned/mastered nodes emphasized so the tree reads at a
 * glance.
 */
export function ArchetypeNodeCard({
  node,
  selected,
  onSelect,
}: {
  node: AtlasNode
  selected: boolean
  onSelect: () => void
}) {
  const { archetype, state } = node
  const display = LINEAGE_DISPLAY[node.archetype.lineage]
  const Icon = LINEAGE_ICONS[display.icon]
  const muted = state.kind === "locked"

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        // Uniform min-height so tier rows stay aligned across a fork even when
        // cards carry different numbers of Affinity chips (which wrap to a
        // second row). The state badge is pinned to the bottom (`mt-auto`) so
        // it lines up across cards regardless of the content above it.
        "flex min-h-52 w-56 flex-col gap-2 border bg-card p-3 text-left transition-colors",
        "hover:border-ring/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        selected && "border-ring ring-[3px] ring-ring/50",
        muted && "opacity-70"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center border border-dashed bg-muted text-muted-foreground"
        >
          <Icon className="size-4" />
        </span>
        <span className="flex flex-col">
          <span className="font-serif leading-tight font-semibold">
            {archetype.name}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {TIER_ROMAN_LABELS[archetype.tier]} · {TIER_LABELS[archetype.tier]}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <ArchetypeAffinityChips archetype={archetype} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {ATTRIBUTE_KEYS.map((key) => (
          <div key={key} className="flex items-baseline justify-between gap-1">
            <dt className="text-muted-foreground">{ATTRIBUTE_LABELS[key]}</dt>
            <dd className="font-medium tabular-nums">
              {formatModifier(archetype.attributes[key])}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-0.5">
        <StateBadge state={state} />
      </div>
    </button>
  )
}
