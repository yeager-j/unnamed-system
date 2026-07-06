-- UNN-552 E1: merge the `sparkLog` component into `virtues` ({ ranks, sparkLog }).
-- Fold any existing flat `virtues` ({ expression, empathy, wisdom, focus }) plus the
-- `sparkLog` column into the new nested shape BEFORE dropping the column, so existing
-- rows keep their Spark progress and validate under the new `virtues` load schema.
-- Guarded on the old-shape marker key (`expression`) so it never double-nests a row
-- already migrated to { ranks, sparkLog } (jsonb_exists, not the `?` operator, which
-- some drivers treat as a bind placeholder).
UPDATE "entity"
SET "virtues" = jsonb_build_object(
  'ranks', "virtues",
  'sparkLog', COALESCE("sparkLog", '[]'::jsonb)
)
WHERE "virtues" IS NOT NULL AND jsonb_exists("virtues", 'expression');
--> statement-breakpoint
ALTER TABLE "entity" DROP COLUMN "sparkLog";
