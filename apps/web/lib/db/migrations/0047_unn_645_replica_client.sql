CREATE TABLE "replicaClient" (
	"clientGroupId" text NOT NULL,
	"clientId" text NOT NULL,
	"entityId" text NOT NULL,
	"lastMutationId" integer NOT NULL,
	"lastOutcome" jsonb,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "replicaClient_clientGroupId_clientId_pk" PRIMARY KEY("clientGroupId","clientId")
);
--> statement-breakpoint
ALTER TABLE "replicaClient" ADD CONSTRAINT "replicaClient_entityId_entity_id_fk" FOREIGN KEY ("entityId") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "replicaClient_entity_updated_idx" ON "replicaClient" USING btree ("entityId","updatedAt");