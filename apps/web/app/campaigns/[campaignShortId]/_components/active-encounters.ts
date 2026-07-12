import type { EncounterSummary } from "@/lib/db/queries/load-encounter"

/**
 * The live-banner listener's subscribe set: every **non-ended** encounter,
 * drafts included — a draft going live is exactly the transition the banner
 * must hear without a reload (UNN-373). Shared by the member overview and the
 * DM manage page (both mount `EncounterStatusListener`).
 */
export function activeEncounters(encounters: EncounterSummary[]) {
  return encounters
    .filter((encounter) => encounter.status !== "ended")
    .map(({ shortId, status }) => ({ shortId, status }))
}
