CREATE TABLE "campaignClock" (
	"campaignId" text PRIMARY KEY NOT NULL,
	"currentDay" integer NOT NULL,
	"slotTemplate" jsonb NOT NULL,
	"storyTier" integer DEFAULT 0 NOT NULL,
	"clockVersion" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaignClock_currentDay_min" CHECK ("campaignClock"."currentDay" >= 1),
	CONSTRAINT "campaignClock_storyTier_range" CHECK ("campaignClock"."storyTier" BETWEEN 0 AND 4),
	CONSTRAINT "campaignClock_slotTemplate_min_one" CHECK (jsonb_array_length("campaignClock"."slotTemplate") >= 1)
);
--> statement-breakpoint
CREATE TABLE "campaignSeason" (
	"campaignId" text NOT NULL,
	"day" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "campaignSeason_campaignId_day_pk" PRIMARY KEY("campaignId","day"),
	CONSTRAINT "campaignSeason_day_min" CHECK ("campaignSeason"."day" >= 1)
);
--> statement-breakpoint
CREATE TABLE "campaignSlot" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"day" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "campaignSlot_campaign_day_ordinal_unique" UNIQUE("campaignId","day","ordinal"),
	CONSTRAINT "campaignSlot_day_min" CHECK ("campaignSlot"."day" >= 1)
);
--> statement-breakpoint
ALTER TABLE "campaignClock" ADD CONSTRAINT "campaignClock_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignSeason" ADD CONSTRAINT "campaignSeason_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignSlot" ADD CONSTRAINT "campaignSlot_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaignSlot_campaign_day_idx" ON "campaignSlot" USING btree ("campaignId","day");