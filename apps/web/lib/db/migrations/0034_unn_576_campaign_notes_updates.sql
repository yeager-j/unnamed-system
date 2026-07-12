CREATE TABLE "campaignBeat" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"sessionId" text,
	"title" text DEFAULT '' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"scheduledSlotId" text,
	"floating" boolean DEFAULT false NOT NULL,
	"deferredFromSlotId" text,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaignBeat_not_scheduled_and_floating" CHECK (NOT ("campaignBeat"."scheduledSlotId" IS NOT NULL AND "campaignBeat"."floating"))
);
--> statement-breakpoint
CREATE TABLE "campaignBeatMention" (
	"beatId" text NOT NULL,
	"participantKind" text NOT NULL,
	"participantId" text NOT NULL,
	CONSTRAINT "campaignBeatMention_beatId_participantKind_participantId_pk" PRIMARY KEY("beatId","participantKind","participantId")
);
--> statement-breakpoint
CREATE TABLE "campaignSession" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaignUpdate" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"day" integer NOT NULL,
	"primaryKind" text,
	"primaryId" text,
	"body" text DEFAULT '' NOT NULL,
	"category" text,
	"slotId" text,
	"resolvesArticleId" text,
	"authoredAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaignUpdate_day_min" CHECK ("campaignUpdate"."day" >= 1),
	CONSTRAINT "campaignUpdate_primary_set_together" CHECK (("campaignUpdate"."primaryKind" IS NULL) = ("campaignUpdate"."primaryId" IS NULL)),
	CONSTRAINT "campaignUpdate_slotted_categorized" CHECK ("campaignUpdate"."slotId" IS NULL OR "campaignUpdate"."category" IS NOT NULL),
	CONSTRAINT "campaignUpdate_slotted_primaried" CHECK ("campaignUpdate"."slotId" IS NULL OR "campaignUpdate"."primaryKind" IS NOT NULL),
	CONSTRAINT "campaignUpdate_marker_is_world" CHECK ("campaignUpdate"."resolvesArticleId" IS NULL OR "campaignUpdate"."slotId" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "campaignUpdateConcern" (
	"updateId" text NOT NULL,
	"participantKind" text NOT NULL,
	"participantId" text NOT NULL,
	CONSTRAINT "campaignUpdateConcern_updateId_participantKind_participantId_pk" PRIMARY KEY("updateId","participantKind","participantId")
);
--> statement-breakpoint
ALTER TABLE "campaignBeat" ADD CONSTRAINT "campaignBeat_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignBeat" ADD CONSTRAINT "campaignBeat_sessionId_campaignSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."campaignSession"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignBeat" ADD CONSTRAINT "campaignBeat_scheduledSlotId_campaignSlot_id_fk" FOREIGN KEY ("scheduledSlotId") REFERENCES "public"."campaignSlot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignBeat" ADD CONSTRAINT "campaignBeat_deferredFromSlotId_campaignSlot_id_fk" FOREIGN KEY ("deferredFromSlotId") REFERENCES "public"."campaignSlot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignBeatMention" ADD CONSTRAINT "campaignBeatMention_beatId_campaignBeat_id_fk" FOREIGN KEY ("beatId") REFERENCES "public"."campaignBeat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignSession" ADD CONSTRAINT "campaignSession_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignUpdate" ADD CONSTRAINT "campaignUpdate_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignUpdate" ADD CONSTRAINT "campaignUpdate_slotId_campaignSlot_id_fk" FOREIGN KEY ("slotId") REFERENCES "public"."campaignSlot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignUpdate" ADD CONSTRAINT "campaignUpdate_resolvesArticleId_campaignArticle_id_fk" FOREIGN KEY ("resolvesArticleId") REFERENCES "public"."campaignArticle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignUpdateConcern" ADD CONSTRAINT "campaignUpdateConcern_updateId_campaignUpdate_id_fk" FOREIGN KEY ("updateId") REFERENCES "public"."campaignUpdate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaignBeat_scheduledSlot_unique" ON "campaignBeat" USING btree ("scheduledSlotId") WHERE "campaignBeat"."scheduledSlotId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaignBeat_campaign_session_idx" ON "campaignBeat" USING btree ("campaignId","sessionId");--> statement-breakpoint
CREATE INDEX "campaignBeatMention_participant_idx" ON "campaignBeatMention" USING btree ("participantKind","participantId");--> statement-breakpoint
CREATE UNIQUE INDEX "campaignUpdate_resolvesArticle_unique" ON "campaignUpdate" USING btree ("resolvesArticleId") WHERE "campaignUpdate"."resolvesArticleId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaignUpdate_slot_primary_unique" ON "campaignUpdate" USING btree ("slotId","primaryId") WHERE "campaignUpdate"."slotId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaignUpdate_chronicle_cursor_idx" ON "campaignUpdate" USING btree ("campaignId","day","authoredAt");--> statement-breakpoint
CREATE INDEX "campaignUpdate_primary_idx" ON "campaignUpdate" USING btree ("campaignId","primaryKind","primaryId");--> statement-breakpoint
CREATE INDEX "campaignUpdateConcern_participant_idx" ON "campaignUpdateConcern" USING btree ("participantKind","participantId");