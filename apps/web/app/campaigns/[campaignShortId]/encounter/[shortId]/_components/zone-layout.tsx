import Image from "next/image"
import { type ReactNode } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { initials } from "@workspace/ui/lib/initials"
import { avatarSrc } from "@workspace/ui/lib/portrait"
import { cn } from "@workspace/ui/lib/utils"

import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"

/**
 * The battlefield grid's own **prop contract** (UNN-535) — the minimal
 * structural slice this component renders, so both shapers (the watch's
 * {@link import("@/domain/combat/view/watch-layout").buildWatchView} and the DM
 * console's layout builder) satisfy it without a shared engine type. A token
 * with a `portraitUrl` draws it; one without gets the side-tinted initials
 * square — presence-driven, not a PC/enemy kind flag.
 */
export interface ZoneLayoutToken {
  id: string
  name: string
  side: "players" | "enemies"
  portraitUrl: string | null
}

export interface ZoneLayoutZone {
  id: string
  name: string
  adjacentZoneNames: string[]
  combatants: ZoneLayoutToken[]
  enchantment?: ZoneEnchantmentBadge
}

export interface ZoneLayoutProps {
  zones: ZoneLayoutZone[]
  unplaced: ZoneLayoutToken[]
  hasZones: boolean
}

/**
 * The read-only **battlefield** (UNN-314): one card per zone showing the
 * combatants in it, which zones it borders, and its Enchantment badge when the
 * session's Enchantment sits on it — plus an "Unplaced" overflow. Pure
 * presentation over the shaped {@link ZoneLayoutProps} — it issues no events
 * and runs no logic in JSX. Shared shape so the player watch view (UNN-334)
 * renders the same component; the DM console alone passes `zoneAction` (the
 * per-zone Enchant menu), so the watch view stays read-only. An encounter with
 * no zones shows the theater-of-mind note; combatants always remain in the
 * rail.
 */
export function ZoneLayout({
  view,
  zoneAction,
}: {
  view: ZoneLayoutProps
  zoneAction?: (zone: ZoneLayoutZone) => ReactNode
}) {
  if (!view.hasZones) {
    return (
      <div
        data-testid="combat-console-battlefield"
        className="flex flex-1 items-center justify-center border border-dashed p-8 text-center text-sm text-muted-foreground"
      >
        This encounter has no zones — theater of mind. Add zones in setup to map
        the battlefield.
      </div>
    )
  }

  return (
    <div
      data-testid="combat-console-battlefield"
      className="flex flex-1 flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {view.zones.map((zone) => (
          <ZoneCard key={zone.id} zone={zone} action={zoneAction?.(zone)} />
        ))}
      </div>
      {view.unplaced.length > 0 ? (
        <UnplacedCard tokens={view.unplaced} />
      ) : null}
    </div>
  )
}

function ZoneCard({
  zone,
  action,
}: {
  zone: ZoneLayoutZone
  action?: ReactNode
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-1.5">
          {zone.name}
          {zone.enchantment ? (
            <EnchantmentBadge enchantment={zone.enchantment} />
          ) : null}
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-xs text-muted-foreground">
          {zone.combatants.length}
          {action}
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1">
        {zone.combatants.length === 0 ? (
          <p className="text-xs text-muted-foreground">Empty</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {zone.combatants.map((token) => (
              <li key={token.id}>
                <TokenChip token={token} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter className="flex-wrap gap-1.5">
        {zone.adjacentZoneNames.length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">Borders</span>
            {zone.adjacentZoneNames.map((name) => (
              <Badge key={name} variant="outline">
                {name}
              </Badge>
            ))}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No borders</span>
        )}
      </CardFooter>
    </Card>
  )
}

function UnplacedCard({ tokens }: { tokens: ZoneLayoutToken[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Unplaced
        </CardTitle>
        <CardAction className="text-xs text-muted-foreground">
          {tokens.length}
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-1.5">
          {tokens.map((token) => (
            <li key={token.id}>
              <TokenChip token={token} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** A combatant token: avatar + name, ringed by side (players vs enemies) so the
 *  side is legible even though zones mix both. */
function TokenChip({ token }: { token: ZoneLayoutToken }) {
  const bg =
    token.side === "players"
      ? "bg-blue-700/10 border-blue-700"
      : "bg-red-700/10 border-red-700"

  return (
    <span
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1.5 border bg-background py-1 pr-2 pl-1",
        bg
      )}
    >
      <TokenAvatar token={token} />
      <span className="truncate text-xs font-medium">{token.name}</span>
    </span>
  )
}

/** A portrait when the token carries one; otherwise a side-tinted initials
 *  square. Both carry a side-colored ring so players read distinct from enemies
 *  at a glance. */
function TokenAvatar({ token }: { token: ZoneLayoutToken }) {
  const ring =
    token.side === "players"
      ? "ring-1 ring-primary/40"
      : "ring-1 ring-destructive/40"

  if (token.portraitUrl !== null) {
    return (
      <Image
        src={avatarSrc(token.portraitUrl, token.name || token.id)}
        alt=""
        width={20}
        height={20}
        className={cn("size-5 shrink-0 rounded-none object-cover", ring)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-none text-[9px] font-semibold",
        token.side === "players"
          ? "bg-primary/10 text-primary"
          : "bg-destructive/10 text-destructive",
        ring
      )}
    >
      {initials(token.name)}
    </span>
  )
}
