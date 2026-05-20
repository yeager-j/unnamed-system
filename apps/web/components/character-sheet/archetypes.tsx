import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { CharacterArchetypeRow } from "@/lib/db/load-character"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"
import { getArchetype } from "@/lib/game/archetypes"
import type { MechanicState } from "@/lib/game/mechanics/schema"
import { MechanicInfoCard } from "./mechanics/mechanic-info-card"

/**
 * The Archetypes-tab body. Lists every unlocked Archetype with its rank,
 * lineage/tier badge, and (when defined) a read-only summary of its unique
 * mechanic's current state. Doubles as the home for cross-Archetype mechanic
 * inspection: even when the Knight is the active Archetype, the player can
 * see at a glance that their Warrior is sitting at Perfection rank B.
 */
export function Archetypes({ character }: { character: HydratedCharacter }) {
  if (character.archetypeRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Archetypes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No Archetypes unlocked yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  const rows = [...character.archetypeRows].sort((a, b) => {
    if (a.id === character.activeArchetypeId) return -1
    if (b.id === character.activeArchetypeId) return 1
    return a.archetypeKey.localeCompare(b.archetypeKey)
  })

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <ArchetypeCard
          key={row.id}
          row={row}
          isActive={row.id === character.activeArchetypeId}
        />
      ))}
    </div>
  )
}

function ArchetypeCard({
  row,
  isActive,
}: {
  row: CharacterArchetypeRow
  isActive: boolean
}) {
  const archetype = getArchetype(row.archetypeKey)
  if (!archetype) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-3">
          <span>
            {archetype.name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              Rank {row.rank}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {isActive ? <Badge>Active</Badge> : null}
            <Badge variant="secondary">
              {LINEAGE_LABELS[archetype.lineage]}
            </Badge>
            <Badge variant="outline">{TIER_LABELS[archetype.tier]}</Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MechanicInfoCard
          archetype={archetype}
          state={row.mechanicState as MechanicState | null}
        />
      </CardContent>
    </Card>
  )
}

const LINEAGE_LABELS: Record<string, string> = {
  warrior: "Warrior Lineage",
  mage: "Mage Lineage",
  brawler: "Brawler Lineage",
  knight: "Knight Lineage",
  healer: "Healer Lineage",
  thief: "Thief Lineage",
  berserker: "Berserker Lineage",
  bard: "Bard Lineage",
  shapechanger: "Shapechanger Lineage",
  hunter: "Hunter Lineage",
  warlock: "Warlock Lineage",
  summoner: "Summoner Lineage",
}

const TIER_LABELS: Record<string, string> = {
  initiate: "Initiate",
  adept: "Adept",
  elite: "Elite",
  paragon: "Paragon",
}
