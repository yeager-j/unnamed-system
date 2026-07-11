import type { ParticipantMeta } from "@/domain/combat/participant-meta"

/**
 * The combatant's **display home** — the pc-vs-enemy key every storage-derived
 * display fact varies by (avatar variant, down label, edit-scope note, subtitle
 * fallback, the setMax affordance). This is where the loader's storage
 * projection ({@link ParticipantMeta}) dies into display vocabulary (UNN-596):
 * {@link displayHome} is the one place `meta.storage` becomes a display key,
 * and the builders index `{pc, enemy}`-keyed tables with it instead of
 * re-branching a boolean. (`setup-view.ts` still narrows `meta.storage`
 * directly — it extracts the `characterId` write token, not display.)
 */
export type DisplayHome = "pc" | "enemy"

export function displayHome(meta: ParticipantMeta | undefined): DisplayHome {
  return meta?.storage === "durable" ? "pc" : "enemy"
}
