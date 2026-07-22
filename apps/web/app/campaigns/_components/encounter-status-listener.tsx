"use client"

import type { Canon } from "@workspace/headcanon"
import { createNextObservedRoot } from "@workspace/headcanon/next/client"

import type { ActiveEncounterStatus } from "@/lib/db/queries/active-encounter-canon"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

const useEncounterStatuses = createNextObservedRoot({
  invalidations: axisInvalidations,
})

export function EncounterStatusListener({
  encounters,
}: {
  encounters: Canon<ActiveEncounterStatus[]>
}) {
  useEncounterStatuses({ canon: encounters })
  return null
}
