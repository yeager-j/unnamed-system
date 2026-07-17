CREATE TABLE "templateSet" (
	"id" text PRIMARY KEY NOT NULL,
	"shortId" text NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "templateSet_shortId_unique" UNIQUE("shortId")
);
--> statement-breakpoint
ALTER TABLE "templateSet" ADD CONSTRAINT "templateSet_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;