CREATE TABLE "map" (
	"id" text PRIMARY KEY NOT NULL,
	"shortId" text NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_shortId_unique" UNIQUE("shortId")
);
--> statement-breakpoint
ALTER TABLE "map" ADD CONSTRAINT "map_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapInstance" ADD CONSTRAINT "mapInstance_mapId_map_id_fk" FOREIGN KEY ("mapId") REFERENCES "public"."map"("id") ON DELETE set null ON UPDATE no action;