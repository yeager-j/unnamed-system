DROP TABLE "characterTalent" CASCADE;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "gainedTalents" jsonb DEFAULT '[]'::jsonb NOT NULL;