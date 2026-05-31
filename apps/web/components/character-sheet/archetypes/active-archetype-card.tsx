import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { ArchetypeDetailHeader } from "@/components/archetype/archetype-detail-header"
import { formatMasteryDescription } from "@/components/archetype/format"
import { ArchetypeDetail } from "@/components/character-sheet/archetypes/archetype-detail"
import { hasMasteryBonus, type ArchetypeEntry } from "@/lib/game/archetypes"
import type { AttributeScores } from "@/lib/game/character"

export function ActiveArchetypeCard({
  entry,
  attributes,
  origin,
}: {
  entry: ArchetypeEntry
  attributes: AttributeScores
  origin?: boolean
}) {
  const { archetype, row } = entry
  return (
    <Card>
      <CardHeader>
        <ArchetypeDetailHeader
          archetype={archetype}
          rank={row.rank}
          titleAs={CardTitle}
          origin={origin}
        />
        <CardAction>
          {hasMasteryBonus(row.rank) ? (
            <Badge>
              Mastery: {formatMasteryDescription(archetype.mastery)}
            </Badge>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        <ArchetypeDetail entry={entry} attributes={attributes} />
      </CardContent>
    </Card>
  )
}
