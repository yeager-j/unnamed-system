CREATE TABLE "campaignUser" (
	"campaignId" text NOT NULL,
	"userId" text NOT NULL,
	CONSTRAINT "campaignUser_campaignId_userId_pk" PRIMARY KEY("campaignId","userId")
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"shortId" text NOT NULL,
	"dmUserId" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_shortId_unique" UNIQUE("shortId")
);
--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "campaignId" text;--> statement-breakpoint
ALTER TABLE "campaignUser" ADD CONSTRAINT "campaignUser_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaignUser" ADD CONSTRAINT "campaignUser_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_dmUserId_user_id_fk" FOREIGN KEY ("dmUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;