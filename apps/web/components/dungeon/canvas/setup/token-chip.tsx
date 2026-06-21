"use client"

import {
  CheckCircleIcon,
  CircleDashedIcon,
} from "@phosphor-icons/react/dist/ssr"

import { cn } from "@workspace/ui/lib/utils"

import { useDungeonSetupCanvas } from "@/components/dungeon/canvas/setup/context"
import { TokenGlyph } from "@/components/dungeon/canvas/token-glyph"

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
 * to {@link import("@/components/dungeon/canvas/setup/context").useDungeonSetupCanvas}; a staged
 * enemy renders as a static dashed-red arrival. The live inclusion state is read
 * from the context, not `token.included`, so a toggle reflects immediately.
 */
export function DungeonSetupTokenChip({
  token,
}: {
  token: DungeonSetupZoneToken
}) {
  const { isIncluded, onTogglePc, disabled } = useDungeonSetupCanvas()

  if (!token.isPc) {
    return (
      <span className="inline-flex max-w-[10rem] items-center gap-1.5 border border-dashed border-red-400 bg-red-50 py-1 pr-2 pl-1 text-red-900 dark:bg-red-950/50 dark:text-red-100">
        <TokenGlyph
          name={token.name}
          portraitUrl={null}
          initialsClassName="bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100"
        />
        <span className="truncate text-xs font-medium">{token.name}</span>
      </span>
    )
  }

  const included = isIncluded(token.id)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onTogglePc(token.id)}
      aria-pressed={included}
      aria-label={`${token.name}${included ? " (in the fight)" : " (excluded)"}`}
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1.5 border border-blue-700 bg-blue-100 py-1 pr-2 pl-1 dark:border-blue-400 dark:bg-blue-950",
        !included && "opacity-40 grayscale"
      )}
    >
      <TokenGlyph
        name={token.name}
        portraitUrl={token.portraitUrl}
        initialsClassName="bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100"
      />
      <span className="truncate text-xs font-medium text-blue-950 dark:text-blue-100">
        {token.name}
      </span>
      {included ? (
        <CheckCircleIcon
          weight="fill"
          className="size-3.5 shrink-0 text-blue-700 dark:text-blue-300"
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
