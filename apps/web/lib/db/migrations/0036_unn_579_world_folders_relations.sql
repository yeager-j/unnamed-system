CREATE TABLE "campaignFolder" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"kind" text NOT NULL,
	"parentId" text,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaignFolder_id_kind_unique" UNIQUE("id","kind")
);
--> statement-breakpoint
CREATE TABLE "campaignRelation" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"sourceKind" text NOT NULL,
	"sourceId" text NOT NULL,
	"targetKind" text NOT NULL,
	"targetId" text NOT NULL,
	"label" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaignArticle" ADD COLUMN "folderId" text;--> statement-breakpoint
ALTER TABLE "campaignNpc" ADD COLUMN "folderId" text;--> statement-breakpoint
ALTER TABLE "campaignFolder" ADD CONSTRAINT "campaignFolder_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignFolder" ADD CONSTRAINT "campaignFolder_parent_fk" FOREIGN KEY ("parentId","kind") REFERENCES "public"."campaignFolder"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignRelation" ADD CONSTRAINT "campaignRelation_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaignFolder_campaign_kind_idx" ON "campaignFolder" USING btree ("campaignId","kind");--> statement-breakpoint
CREATE INDEX "campaignRelation_source_idx" ON "campaignRelation" USING btree ("campaignId","sourceKind","sourceId");--> statement-breakpoint
CREATE INDEX "campaignRelation_target_idx" ON "campaignRelation" USING btree ("campaignId","targetKind","targetId");--> statement-breakpoint
ALTER TABLE "campaignArticle" ADD CONSTRAINT "campaignArticle_folderId_campaignFolder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."campaignFolder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignNpc" ADD CONSTRAINT "campaignNpc_folderId_campaignFolder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."campaignFolder"("id") ON DELETE set null ON UPDATE no action;