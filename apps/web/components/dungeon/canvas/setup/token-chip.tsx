"use client"

import {
  CheckCircleIcon,
  CircleDashedIcon,
} from "@phosphor-icons/react/dist/ssr"

import { cn } from "@workspace/ui/lib/utils"

import { useDungeonSetupCanvas } from "@/components/dungeon/canvas/setup/context"
import { TokenGlyph } from "@/components/dungeon/canvas/token-glyph"
import { TOKEN_SIDE_STYLES } from "@/components/dungeon/canvas/token-styles"

export interface DungeonSetupZoneToken {
  /** The PC's `characterId`, or a staged enemy's display key. */
  id: string
  name: string
  portraitUrl: string | null
  side: "players" | "enemies"
  isPc: boolean
  /** In the staged fight — PCs toggle this; staged enemies are always in. */
  included: boolean
}

/**
 * A token on the encounter **Setup** board (UNN-467). A PC renders as a tappable
 * inclusion toggle (a tick when in the fight, dashed + dimmed when excluded), wired
 * to {@link import("@/components/dungeon/canvas/setup/context").useDungeonSetupCanvas};
 * a staged enemy renders as a static dashed-red arrival. This is the one chip not
 * built on the shared {@link import("@/components/dungeon/canvas/token-chip").TokenChip}
 * shell — it's a horizontal toggle with no vital bars — but it draws its side tint
 * from the shared {@link TOKEN_SIDE_STYLES}.
 */
export function DungeonSetupTokenChip({
  token,
}: {
  token: DungeonSetupZoneToken
}) {
  const { isIncluded, onTogglePc, disabled } = useDungeonSetupCanvas()

  if (!token.isPc) {
    const tint = TOKEN_SIDE_STYLES.enemies
    return (
      <span
        className={cn(
          "inline-flex max-w-[10rem] items-center gap-1.5 border border-dashed py-1 pr-2 pl-1",
          tint.chip
        )}
      >
        <TokenGlyph
          name={token.name}
          portraitUrl={null}
          initialsClassName={tint.initials}
        />
        <span className={cn("truncate text-xs font-medium", tint.name)}>
          {token.name}
        </span>
      </span>
    )
  }

  const tint = TOKEN_SIDE_STYLES.players
  const included = isIncluded(token.id)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onTogglePc(token.id)}
      aria-pressed={included}
      aria-label={`${token.name}${included ? " (in the fight)" : " (excluded)"}`}
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1.5 border py-1 pr-2 pl-1",
        tint.chip,
        !included && "opacity-40 grayscale"
      )}
    >
      <TokenGlyph
        name={token.name}
        portraitUrl={token.portraitUrl}
        initialsClassName={tint.initials}
      />
      <span className={cn("truncate text-xs font-medium", tint.name)}>
        {token.name}
      </span>
      {included ? (
        <CheckCircleIcon
          weight="fill"
          className="size-3.5 shrink-0 text-blue-300"
          aria-hidden
        />
      ) : (
        <CircleDashedIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </button>
  )
}
