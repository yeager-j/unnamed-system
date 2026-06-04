ALTER TABLE "campaign" ADD COLUMN "joinToken" text;--> statement-breakpoint
UPDATE "campaign" SET "joinToken" = gen_random_uuid() WHERE "joinToken" IS NULL;--> statement-breakpoint
ALTER TABLE "campaign" ALTER COLUMN "joinToken" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_joinToken_unique" UNIQUE("joinToken");
