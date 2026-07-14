-- UNN-617: sessions dissolve into the shared folder tree (kind = 'session').
-- The rename carries every beat's membership across untouched, and the folder
-- rows are minted with the sessions' own ids, so the repointed FK validates
-- against the same values the column already held — no beat is orphaned and
-- Unfiled membership (folderId IS NULL) is unchanged.
ALTER TABLE "campaignBeat" DROP CONSTRAINT "campaignBeat_sessionId_campaignSession_id_fk";--> statement-breakpoint
DROP INDEX "campaignBeat_campaign_session_idx";--> statement-breakpoint
ALTER TABLE "campaignBeat" RENAME COLUMN "sessionId" TO "folderId";--> statement-breakpoint
INSERT INTO "campaignFolder" ("id", "campaignId", "kind", "parentId", "name", "createdAt", "updatedAt") SELECT "id", "campaignId", 'session', NULL, "name", "createdAt", "updatedAt" FROM "campaignSession";--> statement-breakpoint
ALTER TABLE "campaignBeat" ADD CONSTRAINT "campaignBeat_folderId_campaignFolder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."campaignFolder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP TABLE "campaignSession" CASCADE;--> statement-breakpoint
CREATE INDEX "campaignBeat_campaign_folder_idx" ON "campaignBeat" USING btree ("campaignId","folderId");
