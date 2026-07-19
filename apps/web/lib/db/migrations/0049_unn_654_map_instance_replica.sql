CREATE TABLE "mapInstanceReplicaClient" (
	"clientGroupId" text NOT NULL,
	"clientId" text NOT NULL,
	"mapInstanceId" text NOT NULL,
	"lastMutationId" integer NOT NULL,
	"lastOutcome" jsonb,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mapInstanceReplicaClient_clientGroupId_clientId_pk" PRIMARY KEY("clientGroupId","clientId")
);
--> statement-breakpoint
ALTER TABLE "mapInstance" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
UPDATE "mapInstance" AS mi
SET "status" = 'frozen'
WHERE NOT EXISTS (
	SELECT 1
	FROM "dungeon" AS d
	WHERE d."mapInstanceId" = mi."id"
		AND d."deletedAt" IS NULL
		AND d."status" IN ('draft', 'active')
)
AND NOT EXISTS (
	SELECT 1
	FROM "encounter" AS e
	WHERE e."mapInstanceId" = mi."id"
		AND e."status" IN ('draft', 'live')
);--> statement-breakpoint
ALTER TABLE "mapInstanceReplicaClient" ADD CONSTRAINT "mapInstanceReplicaClient_mapInstanceId_mapInstance_id_fk" FOREIGN KEY ("mapInstanceId") REFERENCES "public"."mapInstance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mapInstanceReplicaClient_instance_updated_idx" ON "mapInstanceReplicaClient" USING btree ("mapInstanceId","updatedAt");
