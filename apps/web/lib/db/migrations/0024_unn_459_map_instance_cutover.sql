DELETE FROM "encounter";--> statement-breakpoint
DELETE FROM "mapInstance";--> statement-breakpoint
ALTER TABLE "encounter" ALTER COLUMN "mapInstanceId" SET NOT NULL;
