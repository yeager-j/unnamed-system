ALTER TABLE "character" ADD COLUMN "originCharacterArchetypeId" text;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_originCharacterArchetypeId_characterArchetype_id_fk" FOREIGN KEY ("originCharacterArchetypeId") REFERENCES "public"."characterArchetype"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- UNN-173: backfill Origin for pre-existing rows. Every character created
-- before this column existed has Origin == its active Archetype (the only
-- Archetype any seed was built around), so point Origin at the same sibling row.
UPDATE "character" SET "originCharacterArchetypeId" = "activeArchetypeId" WHERE "activeArchetypeId" IS NOT NULL;