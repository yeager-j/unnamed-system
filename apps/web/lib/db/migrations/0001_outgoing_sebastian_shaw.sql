CREATE TABLE "actionLogEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"characterId" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"undoableUntil" timestamp
);
--> statement-breakpoint
CREATE TABLE "characterArchetype" (
	"id" text PRIMARY KEY NOT NULL,
	"characterId" text NOT NULL,
	"archetypeKey" text NOT NULL,
	"rank" integer DEFAULT 1 NOT NULL,
	"inheritanceSlots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"masteryBonusApplied" boolean DEFAULT false NOT NULL,
	CONSTRAINT "characterArchetype_characterId_archetypeKey_unique" UNIQUE("characterId","archetypeKey")
);
--> statement-breakpoint
CREATE TABLE "characterChain" (
	"id" text PRIMARY KEY NOT NULL,
	"characterId" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characterKnife" (
	"id" text PRIMARY KEY NOT NULL,
	"characterId" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characterTalent" (
	"id" text PRIMARY KEY NOT NULL,
	"characterId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character" (
	"id" text PRIMARY KEY NOT NULL,
	"shortId" text NOT NULL,
	"ownerId" text NOT NULL,
	"name" text NOT NULL,
	"pronouns" text,
	"portraitUrl" text,
	"level" integer DEFAULT 1 NOT NULL,
	"pathChoice" text NOT NULL,
	"currentHP" integer NOT NULL,
	"maxHP" integer NOT NULL,
	"currentSP" integer NOT NULL,
	"maxSP" integer NOT NULL,
	"hitDiceRemaining" integer DEFAULT 0 NOT NULL,
	"skillDiceRemaining" integer DEFAULT 0 NOT NULL,
	"permanentBonuses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"virtueExpression" integer DEFAULT 0 NOT NULL,
	"virtueEmpathy" integer DEFAULT 0 NOT NULL,
	"virtueWisdom" integer DEFAULT 0 NOT NULL,
	"virtueFocus" integer DEFAULT 0 NOT NULL,
	"sparkLog" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"victories" integer DEFAULT 0 NOT NULL,
	"currency" integer DEFAULT 0 NOT NULL,
	"prismaCharges" integer DEFAULT 2 NOT NULL,
	"prismaMaxCharges" integer DEFAULT 2 NOT NULL,
	"exhaustion" integer DEFAULT 0 NOT NULL,
	"currentAilment" text,
	"battleConditions" jsonb,
	"activeArchetypeId" text,
	"savedArchetypeRanks" integer DEFAULT 0 NOT NULL,
	"ancestryText" text,
	"backgroundText" text,
	"backstoryText" text,
	"personalityTraits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dreams" text,
	"fears" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secrets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_shortId_unique" UNIQUE("shortId")
);
--> statement-breakpoint
CREATE TABLE "inventoryItem" (
	"id" text PRIMARY KEY NOT NULL,
	"characterId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actionLogEntry" ADD CONSTRAINT "actionLogEntry_characterId_character_id_fk" FOREIGN KEY ("characterId") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characterArchetype" ADD CONSTRAINT "characterArchetype_characterId_character_id_fk" FOREIGN KEY ("characterId") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characterChain" ADD CONSTRAINT "characterChain_characterId_character_id_fk" FOREIGN KEY ("characterId") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characterKnife" ADD CONSTRAINT "characterKnife_characterId_character_id_fk" FOREIGN KEY ("characterId") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characterTalent" ADD CONSTRAINT "characterTalent_characterId_character_id_fk" FOREIGN KEY ("characterId") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character" ADD CONSTRAINT "character_activeArchetypeId_characterArchetype_id_fk" FOREIGN KEY ("activeArchetypeId") REFERENCES "public"."characterArchetype"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventoryItem" ADD CONSTRAINT "inventoryItem_characterId_character_id_fk" FOREIGN KEY ("characterId") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;