-- UNN-214: BUILDER_STEPS shrinks from 5 entries to 4 (ADR-002). Any
-- in-progress draft whose `builderStep` cursor points at the removed
-- `review` index (old index 4) is clamped to the new max index (3 =
-- `the-person`). One-time data migration; the column default (0) is
-- unchanged.
UPDATE "character" SET "builderStep" = 3 WHERE "builderStep" >= 4;
