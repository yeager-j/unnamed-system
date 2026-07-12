CREATE TABLE "campaignArticle" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"body" text DEFAULT '' NOT NULL,
	"datedDay" integer,
	"datedKind" text,
	"deletedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaignArticle_dated_set_together" CHECK (("campaignArticle"."datedDay" IS NULL) = ("campaignArticle"."datedKind" IS NULL)),
	CONSTRAINT "campaignArticle_datedDay_min" CHECK ("campaignArticle"."datedDay" IS NULL OR "campaignArticle"."datedDay" >= 1)
);
--> statement-breakpoint
CREATE TABLE "campaignNpc" (
	"entityId" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"arcana" text,
	"lineageKey" text,
	"bondTier" integer DEFAULT 0 NOT NULL,
	"bondTierChangedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaignNpc_bondTier_range" CHECK ("campaignNpc"."bondTier" BETWEEN 0 AND 4)
);
--> statement-breakpoint
ALTER TABLE "campaignArticle" ADD CONSTRAINT "campaignArticle_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignNpc" ADD CONSTRAINT "campaignNpc_entityId_entity_id_fk" FOREIGN KEY ("entityId") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignNpc" ADD CONSTRAINT "campaignNpc_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaignArticle_campaign_dated_idx" ON "campaignArticle" USING btree ("campaignId","datedKind","datedDay");--> statement-breakpoint
CREATE INDEX "campaignNpc_campaignId_idx" ON "campaignNpc" USING btree ("campaignId");--> statement-breakpoint
CREATE UNIQUE INDEX "campaignNpc_campaign_lineage_unique" ON "campaignNpc" USING btree ("campaignId","lineageKey") WHERE "campaignNpc"."lineageKey" IS NOT NULL;