CREATE TABLE "campaignSlotDungeon" (
	"slotId" text PRIMARY KEY NOT NULL,
	"dungeonId" text NOT NULL,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaignSlotDungeon" ADD CONSTRAINT "campaignSlotDungeon_slotId_campaignSlot_id_fk" FOREIGN KEY ("slotId") REFERENCES "public"."campaignSlot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignSlotDungeon" ADD CONSTRAINT "campaignSlotDungeon_dungeonId_dungeon_id_fk" FOREIGN KEY ("dungeonId") REFERENCES "public"."dungeon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaignSlotDungeon_dungeon_idx" ON "campaignSlotDungeon" USING btree ("dungeonId");