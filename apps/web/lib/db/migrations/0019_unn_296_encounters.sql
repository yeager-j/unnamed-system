CREATE TABLE "encounter" (
	"id" text PRIMARY KEY NOT NULL,
	"shortId" text NOT NULL,
	"campaignId" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"session" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "encounter_shortId_unique" UNIQUE("shortId")
);
--> statement-breakpoint
ALTER TABLE "encounter" ADD CONSTRAINT "encounter_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;