ALTER TABLE "campaignClock" DROP CONSTRAINT "campaignClock_storyTier_range";--> statement-breakpoint
ALTER TABLE "campaignClock" ALTER COLUMN "storyTier" SET DEFAULT 1;--> statement-breakpoint
UPDATE "campaignClock" SET "storyTier" = 1 WHERE "storyTier" = 0;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "lineageGating" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaignClock" ADD CONSTRAINT "campaignClock_storyTier_range" CHECK ("campaignClock"."storyTier" BETWEEN 1 AND 4);
