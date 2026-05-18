ALTER TABLE "inventoryItem" ADD COLUMN "catalogItemKey" text NOT NULL;--> statement-breakpoint
ALTER TABLE "inventoryItem" DROP COLUMN "itemKey";--> statement-breakpoint
ALTER TABLE "inventoryItem" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "inventoryItem" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "inventoryItem" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "inventoryItem" DROP COLUMN "effects";