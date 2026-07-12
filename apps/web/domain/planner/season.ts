/** A season marker row's shape as this selector needs it (structural — `CampaignSeasonRow` satisfies it). */
export type SeasonMarker = { day: number; label: string }

/**
 * The season label in effect on `day` (D1, PRD FR-8): sparse markers
 * **inherit forward** — the latest marker at or before the day wins; `null`
 * before the first marker. Not a calendar engine.
 */
export function seasonOf(
  seasons: readonly SeasonMarker[],
  day: number
): string | null {
  let current: SeasonMarker | null = null
  for (const season of seasons) {
    if (season.day > day) continue
    if (current === null || season.day > current.day) current = season
  }
  return current?.label ?? null
}
