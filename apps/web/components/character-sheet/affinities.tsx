"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { AffinityGrid } from "@/components/shared/affinity-grid"
import { useCharacter } from "@/hooks/use-character"

/**
 * The read-only Affinity chart (PRD §6.1 / §7.1): all 11 damage types with their
 * engine-resolved Affinity (priority already applied upstream). The grid itself
 * is the shared {@link AffinityGrid} (also used by the combat drawer); this
 * component wraps it in the sheet's card and supplies the character's resolved
 * chart. No controls; the public sheet never mutates state.
 */
export function Affinities() {
  const character = useCharacter()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Affinities</CardTitle>
      </CardHeader>
      <CardContent>
        <AffinityGrid chart={character.affinityChart} />
      </CardContent>
    </Card>
  )
}
