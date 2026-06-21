"use client"

import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

import { initials } from "@/lib/ui/initials"

/**
 * The 20px portrait-or-initials square shared by every dungeon token chip — the
 * party {@link import("@/components/dungeon/canvas/explore/token-chip").DungeonTokenChip}, the combat
 * {@link import("@/components/dungeon/canvas/combat/token-chip").DungeonCombatTokenChip}, and the
 * Setup / fog node chips. The one place the "portrait when one exists, else a
 * tinted initials fallback" branch lives. The side tint + any ring are the
 * caller's — passed per glyph variant so the initials' bg/text never leak onto the
 * portrait and vice-versa.
 */
export function TokenGlyph({
  name,
  portraitUrl,
  initialsClassName,
  portraitClassName,
}: {
  name: string
  portraitUrl?: string | null
  /** Classes for the initials-fallback square (its bg / text tint + any ring). */
  initialsClassName?: string
  /** Classes for the portrait image (e.g. the party self-highlight ring). */
  portraitClassName?: string
}) {
  return portraitUrl ? (
    <Image
      src={portraitUrl}
      alt=""
      width={20}
      height={20}
      className={cn("size-5 shrink-0 object-cover", portraitClassName)}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center text-[9px] font-semibold",
        initialsClassName
      )}
    >
      {initials(name, "?")}
    </span>
  )
}
