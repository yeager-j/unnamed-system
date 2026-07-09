-- UNN-562 (Characters v2 S4): drop the v1 character tables. Every character
-- surface reads the `entity` table now; nothing reads these.
-- `actionLogEntry` is DROPPED, not re-keyed to `entityId`: it has zero app
-- consumers and the v2 sheet redesign dropped the undo affordance it backed, so
-- re-homing a dormant table forward would be dead weight.
DROP TABLE "actionLogEntry" CASCADE;--> statement-breakpoint
DROP TABLE "characterArchetype" CASCADE;--> statement-breakpoint
DROP TABLE "characterChain" CASCADE;--> statement-breakpoint
DROP TABLE "characterKnife" CASCADE;--> statement-breakpoint
DROP TABLE "character" CASCADE;--> statement-breakpoint
DROP TABLE "inventoryItem" CASCADE;