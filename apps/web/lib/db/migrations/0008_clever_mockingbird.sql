ALTER TABLE "character" DROP COLUMN "dreams";--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "dreams" jsonb DEFAULT '[]'::jsonb NOT NULL;
