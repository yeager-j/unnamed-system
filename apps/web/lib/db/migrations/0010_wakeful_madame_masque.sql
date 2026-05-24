ALTER TABLE "character" ADD COLUMN "identityVersion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "vitalsVersion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "inventoryVersion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "progressionVersion" integer DEFAULT 0 NOT NULL;