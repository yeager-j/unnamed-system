"use client"

import { TreeStructureIcon } from "@phosphor-icons/react"
import Link from "next/link"

import { getArchetypeDisplay } from "@workspace/game/engine"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { useCharacter } from "@/hooks/use-character"

import { ActiveArchetypeCard } from "./archetypes/active-archetype-card"

/**
 * The Archetypes tab body (PRD §6.1 Archetypes tab; PRD §7.8 Inheritance
 * Slots). Public, read-only — every interaction on this surface is display.
 *
 * Two elements (UNN-276):
 *
 * 1. The Active Archetype as a **featured** card rendering the full
 *    {@link ActiveArchetypeCard} block, so the at-a-glance details for what the
 *    character is *currently* projecting need no extra clicks.
 * 2. An **Open Lineage Atlas** entry — the canonical roster/tree for both
 *    owners and visitors. The flat "Unlocked Archetypes" list this tab used to
 *    carry was retired in favor of the publicly-viewable Atlas, a strictly
 *    richer showcase (you see *where* a character sits in each Lineage).
 */
export function Archetypes() {
  const character = useCharacter()
  const { activeEntry } = getArchetypeDisplay(character)
  // The Active card is the single source of attributes for every Skill popover
  // beneath it. Read once at the top, pass down — leaves stay context-free.
  const { attributes } = character
  const activeIsOrigin =
    character.originCharacterArchetypeId === activeEntry?.row.id

  return (
    <div className="flex flex-col gap-6">
      {activeEntry ? (
        <ActiveArchetypeCard
          entry={activeEntry}
          attributes={attributes}
          origin={activeIsOrigin}
        />
      ) : (
        <NoActiveArchetypeCard />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-4">
        <div className="flex flex-col">
          <h2 className="font-semibold">Lineage Atlas</h2>
          <p className="text-sm text-muted-foreground">
            Browse every Lineage tree and this character&apos;s unlocked
            Archetypes.
          </p>
        </div>
        <Link
          href={`/c/${character.shortId}/archetypes/atlas`}
          className={buttonVariants({ variant: "outline" })}
        >
          <TreeStructureIcon aria-hidden />
          Open Lineage Atlas
        </Link>
      </div>
    </div>
  )
}

function NoActiveArchetypeCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Archetype</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground italic">
          No active Archetype.
        </p>
      </CardContent>
    </Card>
  )
}
