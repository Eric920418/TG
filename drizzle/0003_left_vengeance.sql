CREATE TABLE "staging_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"label" text NOT NULL,
	"has_media" boolean DEFAULT false NOT NULL,
	"captured_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "staging_message_id" integer;