import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import { getArchetypeDisplay } from "@/lib/game/archetypes/display"
import type { ArchetypeEntry } from "@/lib/game/archetypes/entries"
import { hasMasteryBonus } from "@/lib/game/archetypes/schema"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"

import { ArchetypeDetail } from "./archetypes/archetype-detail"
import { ArchetypeSummary } from "./archetypes/archetype-summary"
import { formatMasteryDescription } from "./archetypes/format"
import { LINEAGE_LABELS } from "./archetypes/lineage-labels"

/**
 * The Archetypes tab body (PRD §6.1 Archetypes tab; PRD §7.8 Inheritance
 * Slots). Public, read-only — every interaction on this surface is display.
 *
 * Layout:
 *
 * 1. A small inline header strip with the Saved Archetype Ranks count.
 * 2. The Active Archetype as a **featured** card rendering the full
 *    {@link ArchetypeDetail} block, so the at-a-glance details for what the
 *    character is *currently* projecting need no extra clicks.
 * 3. **Unlocked Archetypes**, grouped by Lineage (only Lineages with at least
 *    one unlocked Archetype get a heading; Lineages appear in the rulebook's
 *    canonical order). Every unlocked Archetype — *including* the active one,
 *    badged "Active" — renders as a compact {@link ArchetypeSummary} card,
 *    each with a Drawer for the full detail block. Repeating the active card
 *    here keeps the Lineage grid coherent; the spotlight view above stays the
 *    unique-feature surface.
 *
 * Data shaping (cross-Archetype Skill / inheritance-slot resolution) lives in
 * [archetypes/entries.ts](./archetypes/entries.ts); this file is the thin
 * orchestrator.
 *
 * No Switch / Rank up / Unlock affordances appear anywhere — owner-mode
 * concerns live elsewhere.
 */
export function Archetypes({ character }: { character: HydratedCharacter }) {
  const { activeEntry, lineageGroups, unlockedCount } =
    getArchetypeDisplay(character)
  const otherCount = unlockedCount - (activeEntry ? 1 : 0)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-end gap-2 text-xs">
        <span className="text-muted-foreground">Saved Archetype Ranks</span>
        <span className="font-semibold tabular-nums">
          {character.savedArchetypeRanks}
        </span>
      </header>

      {activeEntry ? (
        <ActiveArchetypeCard entry={activeEntry} />
      ) : (
        <NoActiveArchetypeCard />
      )}

      <section className="flex flex-col gap-4" aria-label="Unlocked Archetypes">
        <h2 className="text-lg font-semibold">Unlocked Archetypes</h2>
        {unlockedCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Archetypes unlocked yet.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-6">
              {lineageGroups.map(({ lineage, entries: groupEntries }) => (
                <section
                  key={lineage}
                  className="flex flex-col gap-3"
                  aria-label={LINEAGE_LABELS[lineage]}
                >
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {LINEAGE_LABELS[lineage]}
                  </h3>
                  <ItemGroup>
                    {groupEntries.map((entry) => (
                      <ArchetypeSummary key={entry.row.id} entry={entry} />
                    ))}
                  </ItemGroup>
                </section>
              ))}
            </div>
            {otherCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other Archetypes unlocked yet.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}

function ActiveArchetypeCard({ entry }: { entry: ArchetypeEntry }) {
  const { archetype, row } = entry
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base font-semibold">Active Archetype</span>
          <span className="text-base font-normal text-muted-foreground">
            {archetype.name}
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            Rank {row.rank}/5
          </span>
        </CardTitle>
        <CardAction>
          {hasMasteryBonus(row.rank) ? (
            <Badge>
              Mastery: {formatMasteryDescription(archetype.mastery)}
            </Badge>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        <ArchetypeDetail entry={entry} />
      </CardContent>
    </Card>
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
