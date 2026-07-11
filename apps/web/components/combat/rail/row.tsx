"use client"

import {
  ArrowUUpLeftIcon,
  CheckIcon,
  MapPinIcon,
} from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"

import { COUNTER_KEYS } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { VitalBar } from "@/components/shared/vital-bar"
import type { CombatantAvatar } from "@/lib/combat/view/avatar"
import type { Pool } from "@/lib/combat/view/pool"
import type { RailRow } from "@/lib/combat/view/roster-view"
import { COUNTER_STATUS_LABELS } from "@/lib/ui/labels"

/**
 * One combatant row in the rail (UNN-345). Token + name + HP (and SP for PCs)
 * bars; acted/Fallen rows dim with a ✓, Downed shows a badge. Two behaviors,
 * kept distinct: **clicking the row opens the drawer** (`onSelect`), and the
 * **acting** row (`isCurrent`) auto-expands — because it's that combatant's
 * turn, not a click — to surface engagement, zone, and reaction. The write
 * controls (HP −/+, ailments, …) live in the drawer, not here.
 */
export function CombatantRailRow({
  row,
  onSelect,
}: {
  row: RailRow
  onSelect: (participantId: ParticipantId) => void
}) {
  const dimmed = row.hasActed || row.isFallen

  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      aria-label={`Open ${row.name} detail`}
      className={cn(
        "flex w-full flex-col gap-2 border px-3 py-2 text-left transition-colors hover:bg-muted/50",
        row.isCurrent ? "border-foreground bg-muted/30" : "border-border",
        dimmed && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2.5">
        <Token avatar={row.avatar} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-medium">{row.name}</span>
              {row.downLabel ? (
                <Badge variant="destructive" className="shrink-0">
                  {row.downLabel}
                </Badge>
              ) : null}
              {row.isDowned ? (
                <Badge variant="destructive" className="shrink-0">
                  Downed
                </Badge>
              ) : null}
              {COUNTER_KEYS.filter((key) => (row.counters[key] ?? 0) > 0).map(
                (key) => (
                  <Badge key={key} variant="outline" className="shrink-0">
                    {COUNTER_STATUS_LABELS[key]} ×{row.counters[key]}
                  </Badge>
                )
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {row.isCurrent ? (
                <Badge className="shrink-0">acting</Badge>
              ) : null}
              {row.hasActed ? (
                <CheckIcon
                  weight="bold"
                  className="size-3.5 text-muted-foreground"
                  aria-label="Acted"
                />
              ) : null}
            </span>
          </div>

          {row.hp ? <VitalRow label="HP" pool={row.hp} kind="hp" /> : null}
          {row.sp ? <VitalRow label="SP" pool={row.sp} kind="sp" /> : null}
        </div>
      </div>

      {row.isCurrent ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-[2.875rem]">
          <Badge variant="outline">
            {row.engagement.status === "engaged" ? "Engaged" : "Free"}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <MapPinIcon />
            {row.zoneName ?? "Unzoned"}
          </Badge>
          <Badge
            variant="outline"
            className={cn("gap-1", !row.reactionAvailable && "opacity-60")}
          >
            <ArrowUUpLeftIcon />
            {row.reactionAvailable ? "Reaction up" : "Reaction used"}
          </Badge>
        </div>
      ) : null}
    </button>
  )
}

/** The label · bar · value triple shared by the HP and SP rows. */
function VitalRow({
  label,
  pool,
  kind,
}: {
  label: string
  pool: Pool
  kind: "hp" | "sp"
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
      <VitalBar current={pool.current} max={pool.max} kind={kind} />
      <span className="w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
        {pool.current}/{pool.max}
      </span>
    </div>
  )
}

/** Renders the pre-resolved {@link CombatantAvatar} variant: a portrait image
 *  or a side-tinted initials square. */
function Token({ avatar }: { avatar: CombatantAvatar }) {
  if (avatar.kind === "portrait") {
    return (
      <Image
        src={avatar.src}
        alt=""
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-none object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-none text-[10px] font-semibold",
        avatar.side === "players"
          ? "bg-primary/10 text-primary"
          : "bg-destructive/10 text-destructive"
      )}
    >
      {avatar.label}
    </span>
  )
}
