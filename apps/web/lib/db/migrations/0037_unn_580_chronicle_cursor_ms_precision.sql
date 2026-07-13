ALTER TABLE "campaignUpdate" ALTER COLUMN "authoredAt" SET DATA TYPE timestamp (3);--> statement-breakpoint
ALTER TABLE "campaignUpdate" ALTER COLUMN "authoredAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "campaignUpdate" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3);--> statement-breakpoint
ALTER TABLE "campaignUpdate" ALTER COLUMN "updatedAt" SET DEFAULT now();