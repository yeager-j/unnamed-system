ALTER TABLE "character" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "builderStep" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- All pre-builder characters predate the wizard and should appear as finalized
-- on the My Characters list and the public sheet. New rows continue to default
-- to 'draft' via the column default.
UPDATE "character" SET "status" = 'finalized' WHERE "status" = 'draft';
