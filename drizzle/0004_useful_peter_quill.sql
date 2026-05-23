ALTER TABLE "admins" ADD COLUMN "mtproto_session_enc" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mtproto_session_iv" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mtproto_phone" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mtproto_user_id" bigint;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mtproto_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "send_as" text DEFAULT 'bot' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "send_as_admin_id" integer;