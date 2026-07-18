/**
 * The app's URL vocabulary — the single source of truth for every internal
 * address (UNN-608). Routes group by feature and ownership: characters are
 * top-level (their `campaignId` is nullable), while encounters and dungeons
 * nest under their campaign (both `campaignId`s are `NOT NULL` cascade FKs).
 *
 * The builders make the nesting structural: a nested path *cannot* be built
 * without its campaign shortId, so a call site that lacks one is a type error,
 * not a wrong URL discovered at runtime. Pure strings — importable from the app,
 * components, Server Actions, and the e2e suite alike, so URLs are single-sourced
 * across product and tests.
 */

export const characterPath = (shortId: string) => `/characters/${shortId}`

export const characterBuilderPath = (shortId: string, step: string) =>
  `/characters/${shortId}/builder/${step}`

/**
 * The Animus writer on the live sheet (UNN-221). Owner-only; `doc` is the
 * `?doc=` deep link (`documentRefToParam` output — e.g. `knife:0`,
 * `identity:fears`) that opens the writer straight to a section.
 */
export const characterAnimusPath = (shortId: string, doc?: string) =>
  `/characters/${shortId}/animus${doc ? `?doc=${encodeURIComponent(doc)}` : ""}`

export const characterAtlasPath = (shortId: string) =>
  `/characters/${shortId}/atlas`

export const campaignPath = (shortId: string) => `/campaigns/${shortId}`

export const stagePath = () => "/stage"

export const stageMapsPath = () => `${stagePath()}/maps`

export const stageMapPath = (shortId: string) => `${stageMapsPath()}/${shortId}`

export const stageSetsPath = () => `${stagePath()}/sets`

export const stageSetPath = (shortId: string) => `${stageSetsPath()}/${shortId}`

// Campaign Planner surfaces (UNN-574 D10): the campaign root is the Day Runner
// for the DM (members keep their overview — the fork is per-viewer, not per-URL);
// the nested planner routes are DM-only.
export const campaignManagePath = (shortId: string) =>
  `${campaignPath(shortId)}/manage`

export const campaignNotesPath = (shortId: string) =>
  `${campaignPath(shortId)}/notes`

export const campaignBeatPath = (shortId: string, beatId: string) =>
  `${campaignNotesPath(shortId)}/${beatId}`

export const campaignCalendarPath = (shortId: string) =>
  `${campaignPath(shortId)}/calendar`

export const campaignChroniclePath = (shortId: string) =>
  `${campaignPath(shortId)}/chronicle`

export const campaignNpcsPath = (shortId: string) =>
  `${campaignPath(shortId)}/npcs`

export const campaignNpcPath = (shortId: string, entityId: string) =>
  `${campaignNpcsPath(shortId)}/${entityId}`

export const campaignArticlesPath = (shortId: string) =>
  `${campaignPath(shortId)}/articles`

export const campaignArticlePath = (shortId: string, articleId: string) =>
  `${campaignArticlesPath(shortId)}/${articleId}`

export const encounterConsolePath = (
  campaignShortId: string,
  encounterShortId: string
) => `/campaigns/${campaignShortId}/encounter/${encounterShortId}`

export const encounterSetupPath = (
  campaignShortId: string,
  encounterShortId: string
) => `${encounterConsolePath(campaignShortId, encounterShortId)}/setup`

export const encounterWatchPath = (
  campaignShortId: string,
  encounterShortId: string
) => `${encounterConsolePath(campaignShortId, encounterShortId)}/watch`

export const dungeonConsolePath = (
  campaignShortId: string,
  dungeonShortId: string
) => `/campaigns/${campaignShortId}/dungeon/${dungeonShortId}`

export const dungeonSetupPath = (
  campaignShortId: string,
  dungeonShortId: string
) => `${dungeonConsolePath(campaignShortId, dungeonShortId)}/setup`

export const dungeonWatchPath = (
  campaignShortId: string,
  dungeonShortId: string
) => `${dungeonConsolePath(campaignShortId, dungeonShortId)}/watch`

/**
 * A Region's DM detail page — its expedition history + settings (UNN-589). Nested
 * under its campaign like the dungeon/encounter consoles, since `region.campaignId`
 * is a `NOT NULL` cascade FK, so the builder can't be called without the campaign
 * shortId.
 */
export const campaignRegionPath = (
  campaignShortId: string,
  regionShortId: string
) => `/campaigns/${campaignShortId}/regions/${regionShortId}`

/**
 * The Region-stable player watch link (UNN-589). Players keep **one** URL across a
 * Region's expeditions; the route resolves it to the current run's watch
 * (`loadActiveExpeditionForRegion`). Singular `region/` — the address is the
 * Region, not a specific expedition (contrast {@link campaignRegionPath}'s DM
 * detail list).
 */
export const regionWatchPath = (
  campaignShortId: string,
  regionShortId: string
) => `/campaigns/${campaignShortId}/region/${regionShortId}/watch`

/**
 * Dynamic-route patterns for template-form `revalidatePath(pattern, "page")` —
 * the encounter/dungeon write paths don't cheaply hold the campaign shortId, so
 * they invalidate by route template rather than by concrete address.
 */
export const ENCOUNTER_ROUTE =
  "/campaigns/[campaignShortId]/encounter/[shortId]"
export const DUNGEON_ROUTE = "/campaigns/[campaignShortId]/dungeon/[shortId]"
