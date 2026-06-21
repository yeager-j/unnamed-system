CREATE TABLE "mapInstance" (
	"id" text PRIMARY KEY NOT NULL,
	"mapId" text,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encounter" ADD COLUMN "mapInstanceId" text;--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_mapInstanceId_mapInstance_id_fk" FOREIGN KEY ("mapInstanceId") REFERENCES "public"."mapInstance"("id") ON DELETE restrict ON UPDATE no action;