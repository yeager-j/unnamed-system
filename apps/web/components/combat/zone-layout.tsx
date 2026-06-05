import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

import type {
  ZoneLayoutEntry,
  ZoneLayoutView,
  ZoneToken,
} from "@/lib/game/encounter"
import { initials } from "@/lib/ui/initials"
import { avatarSrc } from "@/lib/ui/portrait"

/**
 * The read-only **battlefield** (UNN-314): one card per zone showing the
 * combatants in it and which zones it borders, plus an "Unplaced" overflow.
 * Pure presentation over the {@link ZoneLayoutView} the page shaped — it issues
 * no events (movement is UNN-315) and runs no logic in JSX. Shared shape so the
 * player watch view (UNN-334) can render the same component. An encounter with no
 * zones shows the theater-of-mind note; combatants always remain in the rail.
 */
export function ZoneLayout({ view }: { view: ZoneLayoutView }) {
  if (!view.hasZones) {
    return (
      <div
        data-testid="combat-console-battlefield"
        className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
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
          <ZoneCard key={zone.id} zone={zone} />
        ))}
      </div>
      {view.unplaced.length > 0 ? (
        <UnplacedCard tokens={view.unplaced} />
      ) : null}
    </div>
  )
}

function ZoneCard({ zone }: { zone: ZoneLayoutEntry }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-medium">{zone.name}</h3>
        <span className="text-xs text-muted-foreground">
          {zone.combatants.length}
        </span>
      </header>

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

      <p className="mt-auto text-xs text-muted-foreground">
        {zone.adjacentZoneNames.length > 0
          ? `Borders ${zone.adjacentZoneNames.join(", ")}`
          : "No borders"}
      </p>
    </section>
  )
}

function UnplacedCard({ tokens }: { tokens: ZoneToken[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Unplaced
        </h3>
        <span className="text-xs text-muted-foreground">{tokens.length}</span>
      </header>
      <ul className="flex flex-wrap gap-1.5">
        {tokens.map((token) => (
          <li key={token.id}>
            <TokenChip token={token} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A combatant token: avatar + name, ringed by side (players vs enemies) so the
 *  side is legible even though zones mix both. */
function TokenChip({ token }: { token: ZoneToken }) {
  return (
    <span className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-md border bg-card py-1 pr-2 pl-1">
      <TokenAvatar token={token} />
      <span className="truncate text-xs font-medium">{token.name}</span>
    </span>
  )
}

/** PC ⇒ portrait; enemy ⇒ side-tinted initials square. Both carry a side-colored
 *  ring so players read distinct from enemies at a glance. */
function TokenAvatar({ token }: { token: ZoneToken }) {
  const ring =
    token.side === "players"
      ? "ring-1 ring-primary/40"
      : "ring-1 ring-destructive/40"

  if (token.isPc) {
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
