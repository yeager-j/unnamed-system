CREATE TABLE "dungeon" (
	"id" text PRIMARY KEY NOT NULL,
	"shortId" text NOT NULL,
	"campaignId" text NOT NULL,
	"mapInstanceId" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dungeon_shortId_unique" UNIQUE("shortId")
);
--> statement-breakpoint
ALTER TABLE "dungeon" ADD CONSTRAINT "dungeon_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon" ADD CONSTRAINT "dungeon_mapInstanceId_mapInstance_id_fk" FOREIGN KEY ("mapInstanceId") REFERENCES "public"."mapInstance"("id") ON DELETE restrict ON UPDATE no action;