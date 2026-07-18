CREATE TABLE "region" (
	"id" text PRIMARY KEY NOT NULL,
	"shortId" text NOT NULL,
	"campaignId" text NOT NULL,
	"name" text NOT NULL,
	"seedMapId" text NOT NULL,
	"templateSetId" text NOT NULL,
	"settings" jsonb NOT NULL,
	"discoveredSiteKeys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"staticReveal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archivedAt" timestamp,
	"version" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "region_shortId_unique" UNIQUE("shortId")
);
--> statement-breakpoint
ALTER TABLE "dungeon" ADD COLUMN "regionId" text;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_seedMapId_map_id_fk" FOREIGN KEY ("seedMapId") REFERENCES "public"."map"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_templateSetId_templateSet_id_fk" FOREIGN KEY ("templateSetId") REFERENCES "public"."templateSet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon" ADD CONSTRAINT "dungeon_regionId_region_id_fk" FOREIGN KEY ("regionId") REFERENCES "public"."region"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Pre-repair (hand-written, UNN-589 D11): the one-active rule was app-side
-- read-then-write until now, so existing data may hold several `active`
-- dungeons in one campaign (racing starts, or pre-UNN-616 archived actives).
-- Demote every active but the newest per campaign to `done` so the unique
-- index below cannot fail to build. Idempotent.
UPDATE "dungeon" SET "status" = 'done'
WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (
			PARTITION BY "campaignId" ORDER BY "createdAt" DESC, "id"
		) AS rank
		FROM "dungeon"
		WHERE "status" = 'active' AND "deletedAt" IS NULL
	) ranked
	WHERE ranked.rank > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "dungeon_one_active_per_campaign" ON "dungeon" USING btree ("campaignId") WHERE status = 'active' AND "deletedAt" IS NULL;