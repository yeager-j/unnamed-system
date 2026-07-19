CREATE TABLE "encounterReplicaClient" (
	"clientGroupId" text NOT NULL,
	"clientId" text NOT NULL,
	"encounterId" text NOT NULL,
	"lastMutationId" integer NOT NULL,
	"lastOutcome" jsonb,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "encounterReplicaClient_clientGroupId_clientId_pk" PRIMARY KEY("clientGroupId","clientId")
);
--> statement-breakpoint
ALTER TABLE "encounterReplicaClient" ADD CONSTRAINT "encounterReplicaClient_encounterId_encounter_id_fk" FOREIGN KEY ("encounterId") REFERENCES "public"."encounter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounterReplicaClient_encounter_updated_idx" ON "encounterReplicaClient" USING btree ("encounterId","updatedAt");