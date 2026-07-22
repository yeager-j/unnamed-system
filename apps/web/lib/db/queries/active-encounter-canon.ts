import { defineCanon, type Canon } from "@workspace/headcanon"

import { encounterAxis } from "@/lib/db/axes"
import type { EncounterSummary } from "@/lib/db/queries/load-encounter"
import type { EncounterStatus } from "@/lib/db/schema/encounter"

export interface ActiveEncounterStatus {
  shortId: string
  status: EncounterStatus
}

export function activeEncounters(
  encounters: EncounterSummary[]
): Canon<ActiveEncounterStatus[]> {
  const active = encounters.filter((encounter) => encounter.status !== "ended")
  return defineCanon({
    value: active.map(({ shortId, status }) => ({ shortId, status })),
    revisions: Object.fromEntries(
      active.map((encounter) => [
        encounterAxis(encounter.id),
        encounter.version,
      ])
    ),
  })
}
