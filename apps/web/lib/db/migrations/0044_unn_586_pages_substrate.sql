-- UNN-586 R1 (pages substrate): stamp the default page into every existing
-- `map.geometry` and `mapInstance.state.geometry` jsonb blob — a `pages` record
-- holding the fixed "default" page, plus `pageId: "default"` on every zone. The
-- zod schema REQUIRES `zone.pageId` from this migration on (one-time migration;
-- lazy parse-time normalization was declined — technical-design D3). The id and
-- name mirror `DEFAULT_PAGE_ID`/`defaultPages()` in game-v2's geometry.schema.
-- Guarded on the absence of the `pages` key (`jsonb_exists`, not the `?`
-- operator, which drivers treat as a bind placeholder) — idempotent, re-run
-- safe. `COALESCE` covers an empty `zones` record (jsonb_object_agg over zero
-- rows is NULL).
UPDATE "map"
SET "geometry" = jsonb_set(
  jsonb_set(
    "geometry",
    '{pages}',
    '{"default": {"id": "default", "name": "Page 1"}}'::jsonb,
    true
  ),
  '{zones}',
  COALESCE(
    (
      SELECT jsonb_object_agg(z.key, z.value || '{"pageId": "default"}'::jsonb)
      FROM jsonb_each("geometry"->'zones') AS z
    ),
    '{}'::jsonb
  ),
  true
)
WHERE jsonb_typeof("geometry") = 'object'
  AND NOT jsonb_exists("geometry", 'pages');
--> statement-breakpoint
-- The Instance's geometry sits one level down (state -> geometry). Rows whose
-- state lacks a geometry object are left alone: the zod default fills them on
-- read with the same fixed default page.
UPDATE "mapInstance"
SET "state" = jsonb_set(
  "state",
  '{geometry}',
  jsonb_set(
    jsonb_set(
      "state"->'geometry',
      '{pages}',
      '{"default": {"id": "default", "name": "Page 1"}}'::jsonb,
      true
    ),
    '{zones}',
    COALESCE(
      (
        SELECT jsonb_object_agg(z.key, z.value || '{"pageId": "default"}'::jsonb)
        FROM jsonb_each("state"->'geometry'->'zones') AS z
      ),
      '{}'::jsonb
    ),
    true
  )
)
WHERE jsonb_typeof("state"->'geometry') = 'object'
  AND NOT jsonb_exists("state"->'geometry', 'pages');
