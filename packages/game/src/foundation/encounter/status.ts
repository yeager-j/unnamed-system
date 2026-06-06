/**
 * An encounter's lifecycle status. `draft` while the DM sets it up, `live` for
 * the single active encounter in a campaign, `ended` once resolved. Owned here
 * (the game domain) rather than inferred from the `encounter` table, so the
 * engine never depends on the persistence layer; `lib/db/schema/encounter`
 * imports this for its `status` column. See `docs/engine-reorg`.
 */
export type EncounterStatus = "draft" | "live" | "ended"
