ALTER TABLE "staging_messages" ADD COLUMN "text" text;--> statement-breakpoint
ALTER TABLE "staging_messages" ADD COLUMN "entities" jsonb;--> statement-breakpoint
ALTER TABLE "staging_messages" ADD COLUMN "media_type" text;--> statement-breakpoint
ALTER TABLE "staging_messages" ADD COLUMN "media_file_id" text;