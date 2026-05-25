ALTER TABLE "character" DROP COLUMN "personalityTraits";--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "hopes";--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "dreams";--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "fears";--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "secrets";--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "personalityTraits" text;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "hopes" text;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "dreams" text;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "fears" text;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "secrets" text;