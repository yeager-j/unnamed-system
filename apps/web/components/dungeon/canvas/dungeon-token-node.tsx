"use client"

import { type Node, type NodeProps } from "@xyflow/react"
import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

import { initials } from "@/lib/ui/initials"

export type DungeonTokenData = {
  characterId: string
  name: string
  portraitUrl: string | null
}
export type DungeonTokenNode = Node<DungeonTokenData, "dungeonToken">

/**
 * A party-member token on the run console (UNN-464) — a draggable avatar + name
 * chip the DM free-drags between Zones (the move snaps to the dropped-on Zone; a
 * normal move costs no turn). PC-only in exploration, so it carries the player
 * side-tint of the combat `TokenChip` without the enemy variant.
 */
export function DungeonTokenNode({ data }: NodeProps<DungeonTokenNode>) {
  return (
    <div
      aria-label={`Token: ${data.name}`}
      className={cn(
        "flex cursor-grab items-center gap-1.5 rounded-full border border-blue-700 bg-blue-100 py-0.5 pr-2 pl-0.5 shadow-sm active:cursor-grabbing",
        "dark:border-blue-400 dark:bg-blue-950"
      )}
    >
      {data.portraitUrl ? (
        <Image
          src={data.portraitUrl}
          alt=""
          width={20}
          height={20}
          className="size-5 shrink-0 rounded-full object-cover ring-1 ring-primary/40"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary ring-1 ring-primary/40"
        >
          {initials(data.name, "?")}
        </span>
      )}
      <span className="max-w-[8rem] truncate text-xs font-medium text-blue-950 dark:text-blue-100">
        {data.name}
      </span>
    </div>
  )
}
