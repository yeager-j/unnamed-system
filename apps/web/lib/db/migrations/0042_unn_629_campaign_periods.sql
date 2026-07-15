CREATE TABLE "campaignPeriod" (
	"campaignId" text NOT NULL,
	"kind" text NOT NULL,
	"day" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "campaignPeriod_campaignId_kind_day_pk" PRIMARY KEY("campaignId","kind","day"),
	CONSTRAINT "campaignPeriod_day_min" CHECK ("campaignPeriod"."day" >= 1),
	CONSTRAINT "campaignPeriod_kind_valid" CHECK ("campaignPeriod"."kind" IN ('season', 'month'))
);
--> statement-breakpoint
ALTER TABLE "campaignPeriod" ADD CONSTRAINT "campaignPeriod_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "campaignPeriod" ("campaignId", "kind", "day", "label") SELECT "campaignId", 'season', "day", "label" FROM "campaignSeason";--> statement-breakpoint
DROP TABLE "campaignSeason" CASCADE;