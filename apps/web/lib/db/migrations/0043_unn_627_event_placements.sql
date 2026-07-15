CREATE TABLE "campaignEventPlacement" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"articleId" text NOT NULL,
	"day" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaignEventPlacement_day_min" CHECK ("campaignEventPlacement"."day" >= 1)
);
--> statement-breakpoint
ALTER TABLE "campaignEventPlacement" ADD CONSTRAINT "campaignEventPlacement_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignEventPlacement" ADD CONSTRAINT "campaignEventPlacement_articleId_campaignArticle_id_fk" FOREIGN KEY ("articleId") REFERENCES "public"."campaignArticle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaignEventPlacement_article_day_unique" ON "campaignEventPlacement" USING btree ("articleId","day");--> statement-breakpoint
CREATE INDEX "campaignEventPlacement_campaign_day_idx" ON "campaignEventPlacement" USING btree ("campaignId","day");--> statement-breakpoint
INSERT INTO "campaignEventPlacement" ("id", "campaignId", "articleId", "day") SELECT gen_random_uuid()::text, "campaignId", "id", "datedDay" FROM "campaignArticle" WHERE "datedKind" = 'event' AND "datedDay" IS NOT NULL;--> statement-breakpoint
UPDATE "campaignArticle" SET "datedDay" = NULL, "datedKind" = NULL WHERE "datedKind" = 'event';--> statement-breakpoint
ALTER TABLE "campaignArticle" ADD CONSTRAINT "campaignArticle_inline_date_deadline_only" CHECK ("campaignArticle"."datedKind" IS NULL OR "campaignArticle"."datedKind" = 'deadline');