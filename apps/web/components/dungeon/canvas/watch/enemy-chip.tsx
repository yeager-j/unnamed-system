"use client"

import { type Pool } from "@workspace/game/engine"

import { TokenGlyph } from "@/components/dungeon/canvas/token-glyph"
import { VitalBar } from "@/components/shared/vital-bar"

/**
 * An **enemy** token on the player battlefield (UNN-467) — the redacted combat
 * peer of {@link import("@/components/dungeon/canvas/explore/token-chip").DungeonTokenChip}. Side-tinted
 * destructive-red (initials, never a portrait) with a thin {@link VitalBar} HP bar;
 * the snapshot carries HP only, so attributes and affinities can't be shown here
 * (the combat-watch redaction, UNN-324) and there is no SP bar.
 */
export function WatchEnemyChip({ name, hp }: { name: string; hp: Pool }) {
  return (
    <span className="inline-flex max-w-[10rem] flex-col gap-1 border border-red-700 bg-red-100 px-1.5 py-1 dark:border-red-400 dark:bg-red-950">
      <span className="flex items-center gap-1.5">
        <TokenGlyph
          name={name}
          portraitUrl={null}
          initialsClassName="bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100"
        />
        <span className="truncate text-xs font-medium text-red-950 dark:text-red-100">
          {name}
        </span>
      </span>
      <VitalBar current={hp.current} max={hp.max} kind="hp" />
    </span>
  )
}
