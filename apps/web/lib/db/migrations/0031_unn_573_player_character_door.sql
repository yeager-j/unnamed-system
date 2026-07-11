CREATE TABLE "playerCharacter" (
	"entityId" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"campaignId" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"builderStep" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity" DROP CONSTRAINT "entity_ownerId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "entity" DROP CONSTRAINT "entity_campaignId_campaign_id_fk";
--> statement-breakpoint
ALTER TABLE "playerCharacter" ADD CONSTRAINT "playerCharacter_entityId_entity_id_fk" FOREIGN KEY ("entityId") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playerCharacter" ADD CONSTRAINT "playerCharacter_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playerCharacter" ADD CONSTRAINT "playerCharacter_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playerCharacter_userId_idx" ON "playerCharacter" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "playerCharacter_campaignId_idx" ON "playerCharacter" USING btree ("campaignId");--> statement-breakpoint
-- UNN-573 backfill: every existing entity is a PC, so mint its door 1:1 before
-- the lifecycle columns leave `entity`. Timestamps carry over so the door's
-- createdAt/updatedAt reflect the substrate's history rather than the migration.
INSERT INTO "playerCharacter" ("entityId", "userId", "campaignId", "status", "builderStep", "createdAt", "updatedAt")
	SELECT "id", "ownerId", "campaignId", "status", "builderStep", "createdAt", "updatedAt" FROM "entity";--> statement-breakpoint
ALTER TABLE "entity" DROP COLUMN "ownerId";--> statement-breakpoint
ALTER TABLE "entity" DROP COLUMN "campaignId";--> statement-breakpoint
ALTER TABLE "entity" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "entity" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "entity" DROP COLUMN "builderStep";
