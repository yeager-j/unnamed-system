ALTER TABLE "inventoryItem" ADD COLUMN "itemKey" text;--> statement-breakpoint
ALTER TABLE "characterArchetype" DROP COLUMN "masteryBonusApplied";--> statement-breakpoint
ALTER TABLE "character" DROP COLUMN "currentAilment";